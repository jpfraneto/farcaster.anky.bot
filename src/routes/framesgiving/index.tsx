import dotenv from "dotenv";
dotenv.config();

import { Button, Frog } from "frog";
import { Logger } from "../../../utils/Logger.js";
import { extractSessionDataFromLongString } from "./functions.js";
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { createPublicClient, createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import ANKY_FRAMESGIVING_ABI from "./anky_framesgiving_contract_abi.json";
import { uploadTXTsessionToPinata } from "../../../utils/pinata.js";
import { getCastTextFromRawAnkyWriting } from "../../../utils/anky.js";

const ANKY_FRAMESGIVING_CONTRACT_ADDRESS =
  "0x699367a44d8ffc90e0cd07cbab218174d13f7e55";

console.log("Setting up Viem clients...");
const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

const ankyFramesgivingWalletClient = createWalletClient({
  chain: base,
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
  const { fid, userWallet } = c.req.query();
  const session_id = crypto.randomUUID();
  console.log(
    `preparing writing session ${session_id} for fid: ${fid}, userWallet: ${userWallet}`
  );

  if (!fid) {
    return c.json({
      session_long_string: `0\n${session_id}\ntell us who you are\n${new Date().getTime()}`,
    });
  }
  const upcomingPrompt = await getUpcomingPromptForUser(fid);
  const session_long_string = `${fid}\n${session_id}\n${upcomingPrompt}\n${new Date().getTime()}`;
  console.log("sending back the session long string:", session_long_string);
  await registerWritingSessionLocally(session_long_string);
  return c.json({
    session_long_string: session_long_string,
  });
});

async function getUpcomingPromptForUser(fid: string) {
  try {
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
      args: [BigInt(fid), session_id],
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
  console.log(`Received end session request - FID: ${fid}`);

  if (!fid || !session_long_string) {
    console.log("Missing required parameters");
    return c.json({ error: "fid and session_long_string are required" }, 400);
  }

  try {
    const session_data = extractSessionDataFromLongString(session_long_string);
    const session_duration = session_data.total_time_written;
    console.log(
      `Session duration: ${session_duration}ms (${session_duration / 1000}s)`
    );

    // Run getCastTextFromRawAnkyWriting in parallel with the upload and contract write
    const [new_cast_text, uploadAndContractResult] = await Promise.all([
      // Get cast text
      getCastTextFromRawAnkyWriting(session_data.session_text, fid),

      // Upload to Pinata and write to contract
      (async () => {
        const ipfsHash = await uploadTXTsessionToPinata(session_long_string);
        if (!ipfsHash) {
          throw new Error("Failed to upload session to Pinata");
        }
        console.log(`Uploaded session to Pinata with hash: ${ipfsHash}`);

        // Create account from private key
        const account = privateKeyToAccount(
          process.env.PRIVATE_KEY as `0x${string}`
        );

        // End session on chain
        const transaction_hash =
          await ankyFramesgivingWalletClient.writeContract({
            account,
            address: ANKY_FRAMESGIVING_CONTRACT_ADDRESS,
            abi: ANKY_FRAMESGIVING_ABI,
            functionName: "endSession",
            args: [BigInt(fid), ipfsHash, session_duration >= 480000], // Pass isAnky flag based on duration
          });
        console.log(
          "the session was ended and the transaction hash is:",
          transaction_hash
        );

        return { ipfsHash, transaction_hash };
      })(),
    ]);

    return c.json({
      success: true,
      transaction_hash: uploadAndContractResult.transaction_hash,
      ipfs_hash: uploadAndContractResult.ipfsHash,
      new_cast_text,
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
    const { session_long_string, fid } = await c.req.json();

    let attempts = 0;
    const maxAttempts = 5;
    const delayMs = 30000;

    while (attempts < maxAttempts) {
      try {
        const response = await axios.post(
          "https://poiesis.anky.bot/framesgiving/generate-anky-image-from-session-long-string",
          {
            session_long_string,
            fid,
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
