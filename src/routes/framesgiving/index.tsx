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
import ANKY_SPANDAS_ABI from "./anky_spandas_contract_abi.json";
import { uploadTXTsessionToPinata } from "../../../utils/pinata.js";
import { z } from "zod";

import { castClankerWithTokenInfo } from "../../../utils/farcaster.js";
import { encodeToAnkyverseLanguage } from "../../../utils/ankyverse.js";
import type { SendNotificationRequest } from "../../types/farcaster.js";
import {
  sendNotificationResponseSchema,
  FrameNotificationDetails,
} from "../../types/farcaster.js";
import {
  sendFrameNotification,
  setUserNotificationDetails,
} from "../../../utils/notifications.js";

const ANKY_FRAMESGIVING_CONTRACT_ADDRESS =
  "0xBc25EA092e9BEd151FD1947eE1Cf957cfdd580ef";

const ANKY_SPANDAS_CONTRACT_ADDRESS =
  "0xc83c51bf18c5e21a8111bd7c967c1ecdb15b90e8";

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
    `preparing writing session ${session_id} for fid: ${fid}, userWallet: ${userWallet}, prompt: ${prompt}`
  );
  console.log("THe prompt is", prompt, fid);

  if (!fid) {
    return c.json({
      session_long_string: `0\n${session_id}\ntell us who you are\n${new Date().getTime()}`,
    });
  }
  let upcomingPrompt, userWritingStats;
  const [upcomingPromptResult, userWritingStatsResult] = await Promise.all([
    !prompt || prompt === "null" || prompt.length == 0
      ? getUpcomingPromptForUser(fid)
      : null,
    getUserWritingStats(fid),
  ]);

  if (!prompt || prompt === "null" || prompt.length == 0) {
    console.log("prompt is null, getting upcoming prompt");
    upcomingPrompt =
      upcomingPromptResult && upcomingPromptResult.length <= 222
        ? upcomingPromptResult
        : "tell me who you are";
  }
  userWritingStats = userWritingStatsResult;

  console.log("upcomingPrompt", upcomingPrompt);
  let promptToUse = prompt;
  if (!promptToUse || promptToUse === "null" || prompt.length == 0) {
    promptToUse = upcomingPrompt || "tell me who you are";
  }
  console.log("promptToUse", promptToUse);
  const session_long_string = `${userWallet}\n${session_id}\n${promptToUse}\n${new Date().getTime()}`;
  await registerWritingSessionLocally(session_long_string);
  return c.json({
    session_long_string: session_long_string,
    userWritingStats: userWritingStats,
  });
});

export async function getUserWritingStats(fid: string) {
  const response = await axios.get(`https://ponder.anky.bot/writer/${fid}`);
  const data = response.data;

  // Convert ankyverse start time to timestamp
  const ankyverseStart = new Date("2023-08-10T05:00:00-04:00").getTime();

  // Sort sessions by startTime
  const sortedSessions = data.sessions.sort(
    (a: any, b: any) => parseInt(a.startTime) - parseInt(b.startTime)
  );

  // Calculate streak
  let currentStreak = 0;
  let maxStreak = 0;
  let lastWritingDay = null;

  for (let i = 0; i < sortedSessions.length; i++) {
    const sessionDate = new Date(parseInt(sortedSessions[i].startTime) * 1000);
    const sessionDay = sessionDate.toISOString().split("T")[0];

    if (lastWritingDay === null) {
      currentStreak = 1;
      lastWritingDay = sessionDay;
    } else {
      const lastDate = new Date(lastWritingDay);
      const diffDays = Math.floor(
        (sessionDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (diffDays === 1) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else if (diffDays > 1) {
        currentStreak = 1;
      }
      lastWritingDay = sessionDay;
    }
  }

  return {
    ...data,
    currentStreak,
    maxStreak,
    daysInAnkyverse: Math.floor(
      (Date.now() - ankyverseStart) / (1000 * 60 * 60 * 24)
    ),
  };
}

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

ankyFramesgivingFrame.get("/leaderboard", async (c) => {
  try {
    console.log("📊 Fetching base leaderboard data...");
    const leaderboardResponse = await axios.get(
      "https://ponder.anky.bot/leaderboard"
    );
    const leaderboardData = leaderboardResponse.data;
    console.log(`📋 Retrieved ${leaderboardData.length} leaderboard entries`);

    // Extract all FIDs and join them with commas for Neynar API
    const fids = leaderboardData.map((entry: any) => entry.fid).join(",");
    console.log(`🔍 Found ${leaderboardData.length} unique FIDs`);

    // Get Farcaster user data from Neynar
    console.log("🌐 Fetching Farcaster user data from Neynar...");
    const neynarResponse = await axios.get(
      `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fids}&viewer_fid=18350`,
      {
        headers: {
          accept: "application/json",
          "x-api-key": process.env.NEYNAR_API_KEY as string,
        },
      }
    );
    console.log(
      `✅ Retrieved Farcaster data for ${neynarResponse.data.users.length} users`
    );

    // Create map of FID to user data for easy lookup
    console.log("🗺️ Creating user data map...");
    const userDataMap = new Map(
      neynarResponse.data.users.map((user: any) => [user.fid, user])
    );
    console.log(`📍 User data map created with ${userDataMap.size} entries`);

    // Combine leaderboard data with Farcaster user data
    console.log("🔄 Enriching leaderboard data with Farcaster user info...");
    const enrichedLeaderboard = leaderboardData.map((entry: any) => {
      const userData = userDataMap.get(entry.fid);
      return {
        ...entry,
        farcaster: userData
          ? {
              username: userData?.username,
              displayName: userData?.display_name,
              pfpUrl: userData?.pfp_url,
              followerCount: userData?.follower_count,
              followingCount: userData?.following_count,
              bio: userData?.profile?.bio?.text || "",
            }
          : null,
      };
    });
    console.log("✨ Leaderboard data enrichment complete");

    return c.json({
      success: true,
      data: enrichedLeaderboard,
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    return c.json(
      {
        success: false,
        error: "Failed to fetch leaderboard data",
      },
      500
    );
  }
});

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
          timeout: 180000,
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

ankyFramesgivingFrame.post("/anky-finished-send-notification", async (c) => {
  const {
    reflection_to_user,
    image_ipfs_hash,
    token_name,
    ticker,
    image_cloudinary_url,
    fid,
    session_id,
  } = await c.req.json();
  console.log("Received request for sending notification for anky finished:", {
    reflection_to_user,
    image_ipfs_hash,
    token_name,
    ticker,
    image_cloudinary_url,
    fid,
    session_id,
  });

  try {
    console.log("Starting notification process...");
    const notificationsPath = path.join(
      process.cwd(),
      "data/framesgiving/notifications_tokens.txt"
    );
    console.log("Looking for notifications file at:", notificationsPath);

    if (!fs.existsSync(notificationsPath)) {
      console.log("No notifications file found at path:", notificationsPath);
      return c.json({ success: false, message: "No notifications file found" });
    }

    console.log("Reading notifications file...");
    const fileContent = fs.readFileSync(notificationsPath, "utf-8");
    console.log("File content read successfully. Processing lines...");
    const lines = fileContent.split("\n").filter((line) => line.trim());
    console.log(`Found ${lines.length} notification entries to process`);

    for (const line of lines) {
      console.log("Processing notification line:", line);
      const [userFid, token, url, targetUrl] = line.trim().split(" ");
      console.log("Parsed line data:", { userFid, token, url, targetUrl });

      if (userFid !== fid.toString()) {
        console.log(`Skipping notification for non-matching FID ${userFid}`);
        continue;
      }
      console.log("Found matching FID, preparing notification...");

      const requestBody = z
        .object({
          token: z.string(),
          url: z.string(),
          targetUrl: z.string(),
        })
        .safeParse({
          token,
          url,
          targetUrl: `${targetUrl}?session_id=${session_id}`,
        });

      if (!requestBody.success) {
        console.log(`Invalid line format: ${line}`, requestBody.error);
        continue;
      }

      try {
        console.log("Sending notification request...");
        const response = await fetch(requestBody.data.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            notificationId: crypto.randomUUID(),
            title: "Your Anky is ready!",
            body: "Click to see your new Anky creation",
            targetUrl: requestBody.data.targetUrl,
            tokens: [requestBody.data.token],
          } satisfies SendNotificationRequest),
        });
        console.log("Notification request sent, processing response...");

        const responseJson = await response.json();
        console.log("Raw response:", responseJson);
        const responseBody =
          sendNotificationResponseSchema.safeParse(responseJson);
        console.log("Parsed response:", responseBody);

        if (!responseBody.success) {
          console.error(
            `Invalid response format for FID ${fid}:`,
            responseBody.error
          );
          continue;
        }

        if (responseBody.data.result.rateLimitedTokens.length) {
          console.error(
            `Rate limited for FID ${fid}`,
            responseBody.data.result.rateLimitedTokens
          );
          continue;
        }

        console.log(
          `Successfully sent notification for FID ${fid}`,
          responseBody.data
        );
      } catch (error: any) {
        console.error(`Error sending notification for FID ${fid}:`, error);
        console.error("Error details:", {
          name: error.name,
          message: error.message,
          stack: error.stack,
        });
      }
    }

    return c.json({ success: true });
  } catch (error: any) {
    console.error("Error sending notifications:", error);
    return c.json({ success: false, error: error.message });
  }
});

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

ankyFramesgivingFrame.post("/set-notification-details", async (c) => {
  try {
    const { fid, notificationDetails } = await c.req.json();

    // Validate the incoming data
    if (!fid || !notificationDetails) {
      return c.json(
        {
          success: false,
          error: "Missing required fields: fid and notificationDetails",
        },
        400
      );
    }

    if (
      !notificationDetails.token ||
      !notificationDetails.url ||
      !notificationDetails.targetUrl
    ) {
      return c.json(
        {
          success: false,
          error:
            "Missing required notification details: token, url, or targetUrl",
        },
        400
      );
    }

    // Create the notification details object
    const frameNotificationDetails: FrameNotificationDetails = {
      title: "", // These will be set when sending notifications
      body: "",
      token: notificationDetails.token,
      url: notificationDetails.url,
      targetUrl: notificationDetails.targetUrl,
      tokens: [notificationDetails.token], // Include in array as per the interface
    };

    // Store the notification details using the Redis helper function
    await setUserNotificationDetails(fid, frameNotificationDetails);

    // Send confirmation notification
    try {
      const response = await fetch(notificationDetails.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          notificationId: crypto.randomUUID(),
          title: "Welcome to Anky Notifications!",
          body: "You'll receive daily reminders to write your Anky. May your writing flow freely! 🌟✍️",
          targetUrl: notificationDetails.targetUrl,
          tokens: [notificationDetails.token],
        } satisfies SendNotificationRequest),
      });

      const responseJson = await response.json();

      // Add default values if they're missing
      const normalizedResponse = {
        success: responseJson.success || false,
        result: {
          successfulTokens: responseJson.result?.successfulTokens || [],
          failedTokens: responseJson.result?.failedTokens || [],
          rateLimitedTokens: responseJson.result?.rateLimitedTokens || [],
        },
      };

      const responseBody =
        sendNotificationResponseSchema.safeParse(normalizedResponse);

      if (!responseBody.success) {
        console.error(
          "Error parsing notification response:",
          responseBody.error
        );
      }

      return c.json({
        success: true,
        message: "Notification details stored successfully",
        notificationSent: response.status === 200,
      });
    } catch (notifError) {
      console.error("Error sending welcome notification:", notifError);
      return c.json({
        success: true,
        message:
          "Notification details stored but welcome message failed to send",
        notificationSent: false,
      });
    }
  } catch (error: any) {
    console.error("Error setting notification details:", error);
    return c.json(
      {
        success: false,
        error: error.message || "Failed to store notification details",
      },
      500
    );
  }
});

ankyFramesgivingFrame.post("/create-new-anky-spanda", async (c) => {
  console.log("🚀 Starting /create-new-anky-spanda endpoint");
  try {
    console.log("📝 Parsing request body");
    const { fid, userWallet, spanda_type, prompt } = await c.req.json();
    console.log("📊 Request params:", { fid, userWallet, spanda_type, prompt });

    console.log("🔑 Creating account from private key");
    const account = privateKeyToAccount(
      process.env.PRIVATE_KEY as `0x${string}`
    );
    console.log("📝 Writing contract for new Anky Spanda");
    const transaction_hash = await ankyFramesgivingWalletClient.writeContract({
      account,
      address: ANKY_SPANDAS_CONTRACT_ADDRESS,
      abi: ANKY_SPANDAS_ABI,
      functionName: "mintPiece",
      args: [userWallet, spanda_type],
    });
    console.log("💫 Transaction hash received:", transaction_hash);

    console.log("⏳ Waiting for transaction receipt");
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: transaction_hash,
    });

    const ankySpandaCreatedLog = receipt.logs.find((log) => {
      try {
        const decodedLog = decodeEventLog({
          abi: ANKY_SPANDAS_ABI,
          data: log.data,
          topics: log.topics,
        });
        return decodedLog.eventName === "PieceCreated";
      } catch {
        return false;
      }
    });

    if (!ankySpandaCreatedLog) {
      console.log("❌ AnkySpandaCreated event not found");
      throw new Error("AnkySpandaCreated event not found in transaction logs");
    }

    const decodedLog = decodeEventLog({
      abi: ANKY_SPANDAS_ABI,
      data: ankySpandaCreatedLog.data,
      topics: ankySpandaCreatedLog.topics,
      eventName: "PieceCreated", // Add this to ensure we're decoding the right event
    });

    const ankySpandaId = Number(decodedLog?.args?.tokenId); // Convert BigInt to Number
    console.log("🆔 Anky Spanda ID:", ankySpandaId);
    try {
      console.log("🎨 Starting spanda creation process");
      const response = await axios.post(
        `https://poiesis.anky.bot/framesgiving/create-anky-from-prompt`,
        { prompt, anky_spanda_id: ankySpandaId.toString() },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      console.log("the response from poiesis is: ", response);
      if (response.status === 200) {
        const metadata = {
          name: ankySpandaId.toString(),
          image: `ipfs://${response.data.ipfsHash}`,
          prompt: prompt,
        };
        const metadataIpfsHash = await uploadTXTsessionToPinata(
          JSON.stringify(metadata)
        );
        const revealTx = await ankyFramesgivingWalletClient.writeContract({
          account,
          address: ANKY_SPANDAS_CONTRACT_ADDRESS,
          abi: ANKY_SPANDAS_ABI,
          functionName: "revealPiece",
          args: [ankySpandaId, metadataIpfsHash],
        });

        console.log("⏳ Waiting for reveal transaction confirmation");
        await publicClient.waitForTransactionReceipt({
          hash: revealTx,
        });

        console.log("📨 Sending notification to user");
        await sendFrameNotification({
          fid: Number(fid),
          title: "Your Anky Spanda is ready!",
          body: "Your piece of art was generated successfully.",
          newTargetUrl: `https://framesgiving.anky.bot/spandas/${metadataIpfsHash}`,
        });
        return c.json({
          success: true,
          transaction_hash,
          message: `Your anky spanda is ready. It was minted and revealed on degenchain`,
          image_url: response.data.cloudinaryUrl,
          image_ipfs_hash: response.data.ipfsHash,
        });
      }
    } catch (generationError) {
      console.error("❌ Error starting spanda generation:", generationError);
    }

    console.log("✅ Returning success response");
    return c.json({
      success: true,
      transaction_hash,
      message: "Spanda creation started. You will be notified when it's ready.",
    });
  } catch (error) {
    console.error("❌ Error creating new anky spanda:", error);
    return c.json({
      success: false,
      error: "there was an error creating the anky spanda",
    });
  }
});

ankyFramesgivingFrame.get("/get-last-sessions", async (c) => {
  try {
    const { limit, cursor, viewerFid } = c.req.query();

    // Get sessions from ponder
    const response = await axios.get(
      `https://ponder.anky.bot/sessions?limit=${limit || 50}&cursor=${
        cursor || ""
      }`
    );

    // Extract unique FIDs from all sessions
    const uniqueFids = [
      ...new Set(response.data.items.map((session: any) => session.fid)),
    ];
    const fidsString = uniqueFids.join(",");

    // Get Farcaster user data from Neynar
    const neynarResponse = await axios.get(
      `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fidsString}&viewer_fid=${viewerFid}`,
      {
        headers: {
          accept: "application/json",
          "x-api-key": process.env.NEYNAR_API_KEY as string,
        },
      }
    );
    // Create map of FID to user data
    const userDataMap = new Map(
      neynarResponse.data.users.map((user: any) => [
        user.fid,
        {
          username: user.username,
          displayName: user.display_name,
          pfpUrl: user.pfp_url,
          followerCount: user.follower_count,
          followingCount: user.following_count,
          bio: user.profile?.bio?.text || "",
          viewer_context: {
            following: user.viewer_context.following,
            followed_by: user.viewer_context.followed_by,
            blocking: user.viewer_context.blocking,
            blocked_by: user.viewer_context.blocked_by,
          },
        },
      ])
    );
    console.log("the user data map is: ", userDataMap);

    // Enrich sessions with Farcaster user data
    const enrichedSessions = response.data.items.map((session: any) => ({
      ...session,
      farcasterUser: userDataMap.get(session.fid) || null,
    }));
    console.log("the enriched sessions are: ", enrichedSessions);
    return c.json({
      ...response.data,
      items: enrichedSessions,
    });
  } catch (error) {
    console.error("Error getting last sessions:", error);
    return c.json({
      success: false,
      error: "there was an error getting the last sessions",
    });
  }
});
