import dotenv from "dotenv";
dotenv.config();

import { Button, Frog, parseEther, TextInput } from "frog";
import { Logger } from "../../../utils/Logger.js";
import {
  extractSessionDataFromLongString,
  getUserBalance,
  uuidToBytes32,
} from "./functions.js";
import fs from "node:fs";
import path from "node:path";
import { Token } from "../../types/clanker.js";
import { getTokenInformationFromLocalStorage } from "../../storage/index.js";
import axios from "axios";
import { createPublicClient, createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import ANKY_FRAMESGIVING_ABI from "./anky_framesgiving_contract_abi.json";
import {
  uploadTXTsessionToPinata,
  uploadTXTsessionToScrollHub,
} from "../../../utils/pinata.js";

const ANKY_FRAMESGIVING_CONTRACT_ADDRESS =
  "0x286b7584c19d8813b3c8216e9933fba159c99725";

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
  const { fid } = c.req.query();
  const session_id = crypto.randomUUID();
  console.log(`preparing writing session ${session_id} for fid: ${fid}`);

  if (!fid) {
    return c.json({
      session_long_string: `0\n${session_id}\ntell us who you are\n${new Date().getTime()}`,
    });
  }
  const upcomingPrompt = await getUpcomingPromptForUser(fid);
  const session_long_string = `${fid}\n${session_id}\n${upcomingPrompt}\n${new Date().getTime()}`;
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

async function saveUpcomingPromptForUser(fid: string, upcomingPrompt: string) {
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

    // Format: fid prompt\n
    const promptLine = `${fid} ${upcomingPrompt}\n`;
    fs.appendFileSync(promptsPath, promptLine);

    console.log(`Saved prompt for FID ${fid}: ${upcomingPrompt}`);
    return true;
  } catch (error) {
    console.error("Error saving prompt:", error);
    return false;
  }
}

ankyFramesgivingFrame.post("/start-writing-session", async (c) => {
  console.log("Starting writing session... ");
  try {
    const { fid, userWallet, session_id, idempotencyKey } = await c.req.json();

    console.log("sessionId", session_id);
    if (!session_id) {
      return c.json({ error: "sessionId is required" }, 400);
    }
    console.log(
      `Received start session request - FID: ${fid}, wallet: ${userWallet}, idempotencyKey: ${idempotencyKey}`
    );

    if (!fid || !userWallet || !idempotencyKey) {
      console.log("Missing required parameters");
      return c.json(
        { error: "fid, userWallet and idempotencyKey are required" },
        400
      );
    }

    // Check if we've already processed this request
    const idempotencyPath = path.join(
      process.cwd(),
      "data/framesgiving/idempotency.txt"
    );
    if (fs.existsSync(idempotencyPath)) {
      const processed = fs.readFileSync(idempotencyPath, "utf-8").split("\n");
      const existingRequest = processed.find((line) =>
        line.includes(idempotencyKey)
      );
      if (existingRequest) {
        const [_, sessionId, txHash, prompt] = existingRequest.split("|");
        console.log(
          `Request with idempotencyKey ${idempotencyKey} already processed`
        );
        return c.json({
          session_id: sessionId,
          transaction_hash: txHash,
          prompt: prompt,
        });
      }
    }

    const result = await startWritingSession(fid, userWallet, sessionId);
    if (result.success) {
      console.log(
        `Session started successfully. Session ID: ${result.sessionId}`
      );
      const upcomingPrompt = await getUpcomingPromptForUser(fid);
      const prompt = upcomingPrompt || "tell us who you are";

      // Store the idempotency record
      const dir = path.dirname(idempotencyPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.appendFileSync(
        idempotencyPath,
        `${idempotencyKey}|${result.sessionId}|${result.transactionHash}|${prompt}\n`
      );

      return c.json({
        session_id: result.sessionId,
        transaction_hash: result.transactionHash,
        prompt,
      });
    } else {
      console.log(`User has active session: ${result.active_session_id}`);
      return c.json(
        {
          error: "the user has an active writing session that they need to end",
          active_session_id: result.active_session_id,
        },
        500
      );
    }
  } catch (error: any) {
    console.error("Error in start-writing-session endpoint:");
    return c.json(
      {
        error: error.message || "Failed to process request",
      },
      500
    );
  }
});

export async function startWritingSession(
  fid: string,
  userWallet: string,
  session_id: string
) {
  try {
    console.log(
      `Starting writing session for FID: ${fid}, wallet: ${userWallet}`
    );
    // Create account from private key
    console.log(
      "Creating account from private key...",
      process.env.PRIVATE_KEY
    );
    const account = privateKeyToAccount(
      process.env.PRIVATE_KEY as `0x${string}`
    );
    console.log("Account created from private key");
    // Convert fid to signed BigInt
    const fidBigInt = BigInt.asIntN(256, BigInt(fid));

    // Later in your code, use the same fidBigInt for startNewWritingSession
    const transaction_hash = await ankyFramesgivingWalletClient.writeContract({
      account,
      address: ANKY_FRAMESGIVING_CONTRACT_ADDRESS,
      abi: ANKY_FRAMESGIVING_ABI,
      functionName: "startNewWritingSession",
      args: [fidBigInt, uuidToBytes32(session_id), userWallet], // Use the same fidBigInt here
    });

    return {
      success: true,
      transactionHash: transaction_hash,
      sessionId: session_id,
      active_session_id: null,
    };
  } catch (error) {
    console.error("Error setting up writing session:", error);
    throw new Error("Failed to setup writing session on blockchain");
  }
}

ankyFramesgivingFrame.post("/create-anky-image-from-long-string", async (c) => {
  const { session_long_string } = await c.req.json();
  const options = {
    method: "POST",
    url: "https://poiesis.anky.bot/generate-anky-image-from-session-long-string",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.POIESIS_API_KEY,
    },
    data: {
      session_long_string,
    },
  };
  const response = await axios.request(options);
  return c.json({ ankyImage: response.data });
});

ankyFramesgivingFrame.post("/check-anky-image-generation-status", async (c) => {
  const { session_id } = await c.req.json();
  const options = {
    method: "POST",
    url: "https://poiesis.anky.bot/check-anky-image-from-session-long-string",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.POIESIS_API_KEY,
    },
    data: {
      session_id: session_id,
    },
  };
  const response = await axios.request(options);
  if (response.data.status == "completed") {
    const { ticker, token_name, story, image_ipfs_hash } = response.data;
    return c.json({
      anky_metadata: { ticker, token_name, story, image_ipfs_hash },
    });
  } else {
    return c.json({ anky_metadata: null });
  }
});

ankyFramesgivingFrame.post("/end-writing-session", async (c) => {
  const { session_long_string, userWallet, fid } = await c.req.json();
  console.log(
    `Received end session request - FID: ${fid}, Wallet: ${userWallet}`
  );

  if (!fid || !session_long_string || !userWallet) {
    console.log("Missing required parameters");
    return c.json(
      { error: "fid, session_long_string and userWallet are required" },
      400
    );
  }

  try {
    const session_data = extractSessionDataFromLongString(session_long_string);

    const session_id = session_data.session_id;
    if (!session_id) {
      console.log("There is no session id, wtf");
    }
    const starting_timestamp = session_data.starting_timestamp;
    console.log(`Session ID: ${session_id}, Start time: ${starting_timestamp}`);

    const session_duration = session_data.total_time_written;
    console.log(
      `Session duration: ${session_duration}ms (${session_duration / 1000}s)`
    );

    const ipfsHash = await uploadTXTsessionToPinata(session_long_string);
    console.log("before scroll hub");
    // const scrollHubPointer = await uploadTXTsessionToScrollHub(
    //   session_long_string
    // );
    // console.log("97iuckhoias7c8", scrollHubPointer);
    if (!ipfsHash) {
      throw new Error("Failed to upload session to Pinata");
    }
    console.log(`Uploaded session to Pinata with hash: ${ipfsHash}`);
    const endSessionTx = await endWritingSession(fid, session_id, ipfsHash);
    console.log("Writing session ended on chain");
    if (session_duration > 480000) {
      // 8 minutes in milliseconds
      console.log("Session duration valid, proceeding with end session flow");

      // End writing session on chain

      // Generate new anky
      const ankyData = await generateNewAnky(session_long_string);
      console.log("New Anky generated:", ankyData);

      // Mint the anky NFT
      const mintTx = await mintAnky(ankyData.writingHash, userWallet);
      console.log("Anky NFT minted successfully");

      return c.json({
        success: true,
        endSessionTx,
        mintTx,
        ankyData,
      });
    } else {
      console.log("Session duration too short");
      return c.json(
        {
          error: "session duration must be at least 8 minutes",
          duration: session_duration,
        },
        400
      );
    }
  } catch (error: any) {
    console.error("Error in end-writing-session endpoint:", error);
    return c.json(
      {
        error: error.message,
      },
      500
    );
  }
});

async function endWritingSession(
  fid: string,
  sessionId: string,
  ipfsHash: string
) {
  try {
    console.log(
      `Ending writing session - FID: ${fid}, Session: ${sessionId}, IPFS Hash: ${ipfsHash}`
    );
    const account = privateKeyToAccount(
      process.env.PRIVATE_KEY as `0x${string}`
    );
    console.log("Account created from private key");

    const transaction_hash = await ankyFramesgivingWalletClient.writeContract({
      account,
      address: ANKY_FRAMESGIVING_CONTRACT_ADDRESS,
      abi: ANKY_FRAMESGIVING_ABI,
      functionName: "endWritingSession",
      args: [BigInt(fid), uuidToBytes32(sessionId), ipfsHash],
    });
    console.log(`Session ended, transaction hash: ${transaction_hash}`);

    return transaction_hash;
  } catch (error) {
    console.error("Error ending writing session:", error);
    throw new Error("Failed to end writing session on blockchain");
  }
}

async function mintAnky(writingHash: string, userWallet: string) {
  console.log(
    `Minting Anky - Writing hash: ${writingHash}, Wallet: ${userWallet}`
  );
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

  const transaction_hash = await ankyFramesgivingWalletClient.writeContract({
    account,
    address: ANKY_FRAMESGIVING_CONTRACT_ADDRESS,
    abi: ANKY_FRAMESGIVING_ABI,
    functionName: "mint",
    args: [writingHash],
  });
  console.log(`Anky minted, transaction hash: ${transaction_hash}`);

  return transaction_hash;
}

async function generateNewAnky(session_long_string: string) {
  try {
    console.log("Generating new Anky from session string...");
    const options = {
      method: "POST",
      url: "https://poiesis.anky.bot/generate-anky-from-session-long-string",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.POIESIS_API_KEY,
      },
      data: {
        session_long_string,
      },
    };
    const response = await axios.request(options);
    console.log("Anky generated successfully:", response.data);
    return response.data;
  } catch (error) {
    console.error("Error generating new anky:", error);
    throw new Error("Failed to generate new anky");
  }
}
