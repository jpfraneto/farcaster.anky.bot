import dotenv from "dotenv";
dotenv.config();

import { Button, Frog } from "frog";
import { Logger } from "../../../utils/Logger.js";
import { extractSessionDataFromLongString } from "./functions.js";
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  TransactionReceipt,
} from "viem";
import { degen } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import ANKY_FRAMESGIVING_ABI from "./anky_framesgiving_contract_abi.json";
import { uploadTXTsessionToPinata } from "../../../utils/pinata.js";
import { z } from "zod";
// import {
//   SendNotificationRequest,
//   sendNotificationResponseSchema,
// } from "@farcaster/frame-sdk";
import { castClankerWithTokenInfo } from "../../../utils/farcaster.js";
import { encodeToAnkyverseLanguage } from "../../../utils/ankyverse.js";

const ANKY_FRAMESGIVING_CONTRACT_ADDRESS =
  "0xBc25EA092e9BEd151FD1947eE1Cf957cfdd580ef";

console.log("Setting up Viem clients...");
const publicClient = createPublicClient({
  chain: degen,
  transport: http(),
});

const ankyFramesgivingWalletClient = createWalletClient({
  chain: degen,
  transport: http(),
});
console.log("Viem clients created successfully");

const imageOptions = {
  width: 600,
  height: 600,
  fonts: [
    {
      name: "Poetsen One",
      source: "google",
    },
    {
      name: "Roboto",
      source: "google",
    },
  ] as any,
};

export const ankyFramesgivingFrame = new Frog({
  title: "Anky Frames Giving",
  imageOptions,
  imageAspectRatio: "1:1",
});

ankyFramesgivingFrame.use(async (c, next) => {
  Logger.info(`[${c.req.method}] : : :  ${c.req.url}`);
  c.res.headers.set("Cache-Control", "max-age=0");
  await next();
});

ankyFramesgivingFrame.get("/", async (c) => {
  console.log("Serving miniapp HTML...");
  const html = fs.readFileSync(
    path.join(process.cwd(), "public/static/miniapp.html"),
    "utf-8"
  );
  return new Response(html, {
    headers: {
      "content-type": "text/html",
    },
  });
});

async function registerWritingSessionLocally(
  session_long_string: string
): Promise<boolean> {
  try {
    const parsedSession = session_long_string.split("\n");
    const user_id = parsedSession[0];
    const session_id = parsedSession[1];

    // Create directory if it doesn't exist
    const dir = path.join(process.cwd(), "data/writing_sessions");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write session file
    const filePath = path.join(dir, `${session_id}.txt`);
    fs.writeFileSync(filePath, session_long_string);

    console.log(
      `Successfully registered session ${session_id} for user ${user_id}`
    );
    return true;
  } catch (error) {
    console.error("Error registering writing session:", error);
    return false;
  }
}

ankyFramesgivingFrame.get("/prepare-writing-session", async (c) => {
  const { fid, userWallet, prompt } = c.req.query();
  const session_id = crypto.randomUUID();
  console.log(
    `preparing writing session ${session_id} for fid: ${fid}, userWallet: ${userWallet}`
  );

  if (!fid) {
    return c.json({
      session_long_string: `0\n${session_id}\ntell us who you are\n${new Date().getTime()}`,
    });
  }
  console.log("THe prompt is", prompt);
  let upcomingPrompt;
  if (prompt == null) {
    upcomingPrompt = await getUpcomingPromptForUser(fid);
  }
  console.log("upcomingPrompt", upcomingPrompt);
  let promptToUse = prompt ?? upcomingPrompt;
  if (
    upcomingPrompt?.split(/[.?]/).filter((s: string) => s.trim()).length > 1
  ) {
    promptToUse = "tell me who you are";
  }
  console.log("promptToUse", promptToUse);
  const session_long_string = `${userWallet}\n${session_id}\n${promptToUse}\n${new Date().getTime()}`;
  await registerWritingSessionLocally(session_long_string);
  return c.json({
    session_long_string: session_long_string,
  });
});

export async function getUpcomingPromptForUser(fid: string) {
  try {
    const response = await axios.get(
      `https://poiesis.anky.bot/framesgiving/get-new-prompt?fid=${fid}`
    );
    console.log(
      "THE RESPONSE FROM GETTING A NEW PROMPT FOR THE USER IS",
      response.data
    );
    if (response.data.prompt) {
      return response.data.prompt;
    }
    const promptsPath = path.join(
      process.cwd(),
      "data/framesgiving/prompts.txt"
    );

    // Create directory if it doesn't exist
    const dir = path.dirname(promptsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Create file if it doesn't exist
    if (!fs.existsSync(promptsPath)) {
      fs.writeFileSync(promptsPath, "");
    }

    const prompts = fs
      .readFileSync(promptsPath, "utf-8")
      .split("\n")
      .filter(Boolean);

    const defaultPrompt = "tell me who you are";
    let index = 0;
    const promptLine = prompts.find((line: string, i: number) => {
      // Split line by space and check if first part matches fid exactly
      const [lineFid] = line.split(" ");
      if (lineFid === fid?.toString()) {
        index = i;
        return true;
      }
      return false;
    });

    return promptLine ? prompts[index + 1] : defaultPrompt;
  } catch (error) {
    console.error("Error reading prompts file:", error);
    return "tell me who you are";
  }
}

async function checkIdempotency(idempotencyKey: string) {
  try {
    // Create directory if it doesn't exist
    const dir = path.join(process.cwd(), "data/idempotency");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filePath = path.join(dir, `${idempotencyKey}.txt`);

    // Check if file already exists (meaning request was already processed)
    if (fs.existsSync(filePath)) {
      return false;
    }

    // Create idempotency file
    fs.writeFileSync(filePath, new Date().toISOString());
    return true;
  } catch (error) {
    console.error("Error checking idempotency:", error);
    return false;
  }
}

ankyFramesgivingFrame.post("/start-writing-session", async (c) => {
  console.log("Starting writing session... ");
  try {
    const { fid, userWallet, idempotencyKey, session_id } = await c.req.json();

    console.log("sessionId", session_id);
    if (!session_id) {
      return c.json({ error: "sessionId is required" }, 400);
    }
    console.log(`Received start session request - FID: ${fid}`);

    if (!fid) {
      console.log("Missing required parameters");
      return c.json({ error: "fid is required" }, 400);
    }

    const idempotency = await checkIdempotency(idempotencyKey);
    if (!idempotency) {
      return c.json({ error: "idempotency check failed" }, 400);
    }

    // Create account from private key
    console.log("Creating account from private key...");
    const account = privateKeyToAccount(
      process.env.PRIVATE_KEY as `0x${string}`
    );
    console.log("Account created from private key");

    // Start session on chain
    const transaction_hash = await ankyFramesgivingWalletClient.writeContract({
      account,
      address: ANKY_FRAMESGIVING_CONTRACT_ADDRESS,
      abi: ANKY_FRAMESGIVING_ABI,
      functionName: "startSession",
      args: [fid, session_id],
    });
    // here there should be an event listener that tells us that the session successfully started
    console.log("Transaction hash:", transaction_hash);

    return c.json({
      success: true,
      transaction_hash,
      session_id,
    });
  } catch (error: any) {
    console.error("Error in start-writing-session endpoint:", error);
    return c.json(
      {
        error: error.message || "Failed to process request",
      },
      500
    );
  }
});

ankyFramesgivingFrame.post("/end-writing-session", async (c) => {
  const { session_long_string, userWallet, fid } = await c.req.json();
  console.log(`Received end session request - userWallet: ${userWallet}`);

  if (!userWallet || !session_long_string) {
    console.log("Missing required parameters");
    return c.json(
      { error: "userWallet and session_long_string are required" },
      400
    );
  }

  try {
    const session_data = extractSessionDataFromLongString(session_long_string);

    const session_duration = session_data.total_time_written;

    // Upload to Pinata and write to contract
    const uploadAndContractResult = await (async () => {
      const writingSessionIpfsHash = await uploadTXTsessionToPinata(
        session_long_string
      );
      if (!writingSessionIpfsHash) {
        throw new Error("Failed to upload session to Pinata");
      }
      console.log(
        `Uploaded session to Pinata with hash: ${writingSessionIpfsHash}`
      );

      // Create account from private key
      const account = privateKeyToAccount(
        process.env.PRIVATE_KEY as `0x${string}`
      );
      console.log(
        "askdjkasjhdsa",
        userWallet,
        session_data.session_id,
        writingSessionIpfsHash,
        session_duration,
        fid
      );
      // 0xed21735DC192dC4eeAFd71b4Dc023bC53fE4DF15 a1d1e467-af58-464c-be25-e73fc755e7e6 bafkreigm7tuhs22w37z7gisiuwiu2fjwq6zgdzfmeugeasproowioxjs7m 493000
      // End session on chain
      const isAnky = session_duration >= 480000;
      console.log("isAnky:", isAnky);
      const transaction_hash = await ankyFramesgivingWalletClient.writeContract(
        {
          account,
          address: ANKY_FRAMESGIVING_CONTRACT_ADDRESS,
          abi: ANKY_FRAMESGIVING_ABI,
          functionName: "endSession",
          args: [fid, session_data.session_id, writingSessionIpfsHash, isAnky],
        }
      );
      console.log(
        "the session was ended and the transaction hash is:",
        transaction_hash
      );

      return { writingSessionIpfsHash, transaction_hash };
    })();

    return c.json({
      success: true,
      transaction_hash: uploadAndContractResult.transaction_hash,
      ipfs_hash: uploadAndContractResult.writingSessionIpfsHash,
    });
  } catch (error: any) {
    console.error("Error in end-writing-session endpoint:", error);
    return c.json(
      {
        error: error.message || "Failed to process request",
      },
      500
    );
  }
});

ankyFramesgivingFrame.post(
  "/generate-anky-image-from-session-long-string",
  async (c) => {
    console.log("Generating anky image from session long string...");
    const { session_long_string, fid } = await c.req.json();

    try {
      const response = await axios.post(
        "https://poiesis.anky.bot/framesgiving/generate-anky-image-from-session-long-string",
        {
          session_long_string: session_long_string,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 88888,
        }
      );
      console.log("Response from anky bot:", response.data);
      return c.json(response.data);
    } catch (error: any) {
      console.log(
        "Error in generate-anky-image-from-session-long-string endpoint:",
        error?.response?.data
      );
      return c.json({ error: "Failed to generate anky image" }, 500);
    }
  }
);

ankyFramesgivingFrame.get("/fetch-anky-metadata-status", async (c) => {
  const { session_id } = await c.req.json();

  let attempts = 0;
  const maxAttempts = 5;
  const delayMs = 30000;

  while (attempts < maxAttempts) {
    try {
      const response = await axios.post(
        "https://poiesis.anky.bot/framesgiving/fetch-anky-metadata-status",
        {
          session_id,
        },
        {
          timeout: 30000, // 30 second timeout
        }
      );
      return c.json(response.data);
    } catch (error) {
      attempts++;
      if (attempts === maxAttempts) {
        throw error; // Throw on final attempt
      }
      console.log(`Attempt ${attempts} failed, retrying in 30 seconds...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
});

// ankyFramesgivingFrame.post("/anky-finished-send-notification", async (c) => {
//   const {
//     reflection_to_user,
//     image_ipfs_hash,
//     token_name,
//     ticker,
//     image_cloudinary_url,
//     fid,
//     session_id,
//   } = await c.req.json();
//   console.log("Received request for sending notification for anky finished:", {
//     reflection_to_user,
//     image_ipfs_hash,
//     token_name,
//     ticker,
//     image_cloudinary_url,
//     fid,
//     session_id,
//   });

//   try {
//     console.log("Starting notification process...");
//     const notificationsPath = path.join(
//       process.cwd(),
//       "data/framesgiving/notifications_tokens.txt"
//     );
//     console.log("Looking for notifications file at:", notificationsPath);

//     if (!fs.existsSync(notificationsPath)) {
//       console.log("No notifications file found at path:", notificationsPath);
//       return c.json({ success: false, message: "No notifications file found" });
//     }

//     console.log("Reading notifications file...");
//     const fileContent = fs.readFileSync(notificationsPath, "utf-8");
//     console.log("File content read successfully. Processing lines...");
//     const lines = fileContent.split("\n").filter((line) => line.trim());
//     console.log(`Found ${lines.length} notification entries to process`);

//     for (const line of lines) {
//       console.log("Processing notification line:", line);
//       const [userFid, token, url, targetUrl] = line.trim().split(" ");
//       console.log("Parsed line data:", { userFid, token, url, targetUrl });

//       if (userFid !== fid.toString()) {
//         console.log(`Skipping notification for non-matching FID ${userFid}`);
//         continue;
//       }
//       console.log("Found matching FID, preparing notification...");

//       const requestBody = z
//         .object({
//           token: z.string(),
//           url: z.string(),
//           targetUrl: z.string(),
//         })
//         .safeParse({
//           token,
//           url,
//           targetUrl: `${targetUrl}?session_id=${session_id}`,
//         });

//       if (!requestBody.success) {
//         console.log(`Invalid line format: ${line}`, requestBody.error);
//         continue;
//       }

//       try {
//         console.log("Sending notification request...");
//         const response = await fetch(requestBody.data.url, {
//           method: "POST",
//           headers: {
//             "Content-Type": "application/json",
//           },
//           body: JSON.stringify({
//             notificationId: crypto.randomUUID(),
//             title: "Your Anky is ready!",
//             body: "Click to see your new Anky creation",
//             targetUrl: requestBody.data.targetUrl,
//             tokens: [requestBody.data.token],
//           } satisfies SendNotificationRequest),
//         });
//         console.log("Notification request sent, processing response...");

//         const responseJson = await response.json();
//         console.log("Raw response:", responseJson);
//         const responseBody =
//           sendNotificationResponseSchema.safeParse(responseJson);
//         console.log("Parsed response:", responseBody);

//         if (!responseBody.success) {
//           console.error(
//             `Invalid response format for FID ${fid}:`,
//             responseBody.error
//           );
//           continue;
//         }

//         if (responseBody.data.result.rateLimitedTokens.length) {
//           console.error(
//             `Rate limited for FID ${fid}`,
//             responseBody.data.result.rateLimitedTokens
//           );
//           continue;
//         }

//         console.log(
//           `Successfully sent notification for FID ${fid}`,
//           responseBody.data
//         );
//       } catch (error: any) {
//         console.error(`Error sending notification for FID ${fid}:`, error);
//         console.error("Error details:", {
//           name: error.name,
//           message: error.message,
//           stack: error.stack,
//         });
//       }
//     }

//     return c.json({ success: true });
//   } catch (error: any) {
//     console.error("Error sending notifications:", error);
//     return c.json({ success: false, error: error.message });
//   }
// });

function findAndDecodeMintEvent(receipt: TransactionReceipt) {
  // Find the AnkyMinted event log
  const mintEvent = receipt.logs.find((log: any) => {
    try {
      const decodedLog = decodeEventLog({
        abi: ANKY_FRAMESGIVING_ABI,
        data: log.data,
        topics: log.topics,
      });
      return decodedLog.eventName === "AnkyMinted";
    } catch {
      return false;
    }
  });

  if (!mintEvent) {
    return null;
  }

  // Decode the event data
  const decodedEvent = decodeEventLog({
    abi: ANKY_FRAMESGIVING_ABI,
    data: mintEvent.data,
    topics: mintEvent.topics,
  });

  return {
    tokenId: decodedEvent?.args?.[0],
  };
}

ankyFramesgivingFrame.post("/deploy-anky", async (c) => {
  // writing_session_ipfs_hash: sessionIpfsHash,
  // image_url: ankyMetadata.image_cloudinary_url,
  // ticker: ankyMetadata.ticker,
  // token_name: ankyMetadata.token_name,
  // description: ankyMetadata.description,
  // writer_address: address,
  // session_id: sessionId,
  // image_ipfs_hash: ankyMetadata.image_ipfs_hash,
  const {
    writing_session_ipfs_hash,
    image_url,
    ticker,
    token_name,
    description,
    writer_address,
    session_id,
    image_ipfs_hash,
    writer_fid,
  } = await c.req.json();
  console.log("Received request for deploying anky:", {
    writing_session_ipfs_hash,
    image_url,
    ticker,
    token_name,
    description,
    writer_address,
    session_id,
    image_ipfs_hash,
    writer_fid,
  });

  try {
    const ankyMetadata = {
      name: token_name,
      description: description,
      image: `ipfs://${image_ipfs_hash}`,
      writing_session: `ipfs://${writing_session_ipfs_hash}`,
      attributes: [
        {
          trait_type: "ticker",
          value: `$${ticker}`,
        },
        {
          trait_type: "writer fid",
          value: writer_fid,
        },
      ],
    };
    console.log("ankyMetadata:", ankyMetadata);
    const metadata_ipfs_hash = await uploadTXTsessionToPinata(
      JSON.stringify(ankyMetadata)
    );
    if (!metadata_ipfs_hash) {
      throw new Error("Failed to upload metadata to Pinata");
    }
    const encodedIpfsHash = encodeToAnkyverseLanguage(metadata_ipfs_hash);
    console.log("encodedIpfsHash:", encodedIpfsHash);
    // Create account from private key
    console.log("Creating account from private key...");
    const account = privateKeyToAccount(
      process.env.PRIVATE_KEY as `0x${string}`
    );
    console.log("Account created from private key");
    const transaction_hash = await ankyFramesgivingWalletClient.writeContract({
      account,
      address: ANKY_FRAMESGIVING_CONTRACT_ADDRESS,
      abi: ANKY_FRAMESGIVING_ABI,
      functionName: "mintAnky",
      args: [
        writer_fid,
        writer_address,
        writing_session_ipfs_hash,
        metadata_ipfs_hash,
        session_id,
      ],
    });
    console.log(
      "THE ANKY WAS MINTED TO THE USER, THE TRANSACTION HASH IS:",
      transaction_hash
    );
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: transaction_hash,
    });
    const mintEventData = findAndDecodeMintEvent(receipt);
    console.log("Mint event data:", mintEventData);
    console.log("Mint event data tokenId:", mintEventData?.tokenId);

    console.log("Transaction hash:", transaction_hash);
    let finalTicker = mintEventData?.tokenId || ticker;
    console.log(
      "SENDING THE REQUEST TO CAST THE CLANKER: ",
      finalTicker,
      token_name,
      1000,
      description,
      image_url,
      encodedIpfsHash,
      writer_fid
    );
    const cast_hash = await castClankerWithTokenInfo(
      finalTicker,
      token_name,
      1000,
      description,
      image_url,
      encodedIpfsHash,
      writer_fid
    );
    return c.json({ success: true, cast_hash });
  } catch (error) {
    console.error("Error deploying anky:", error);
    return c.json({
      success: false,
      error: "there was an error deploying the anky",
    });
  }
});
