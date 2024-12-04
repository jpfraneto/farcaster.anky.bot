import dotenv from "dotenv";
dotenv.config();

import { Button, Frog, parseEther, TextInput } from "frog";
import { Logger } from "../../../utils/Logger.js";
import { getUserBalance } from "./functions.js";
import fs from "node:fs";
import path from "node:path";
import { Token } from "../../types/clanker.js";
import { getTokenInformationFromLocalStorage } from "../../storage/index.js";
import axios from "axios";
import { createPublicClient, createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import ANKY_FRAMESGIVING_ABI from "./anky_framesgiving_contract_abi.json";

const ANKY_FRAMESGIVING_CONTRACT_ADDRESS =
  "0xc833157cf0802db4911e09bb9ea39fb8606fbbb3";

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

export async function startWritingSession(fid: string, userWallet: string) {
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
    const new_session_id = crypto.randomUUID();
    console.log(`Generated new session ID: ${new_session_id}`);

    // Convert fid to signed BigInt
    const fidBigInt = BigInt.asIntN(256, BigInt(fid));

    // Check if user has active session
    console.log("Checking for active session...");
    const active_session_id = await publicClient.readContract({
      address: ANKY_FRAMESGIVING_CONTRACT_ADDRESS,
      abi: ANKY_FRAMESGIVING_ABI,
      functionName: "checkIfUserHasActiveSession",
      args: [fidBigInt], // Use the converted fidBigInt here
    });
    console.log("Active session check result:", active_session_id);

    if (active_session_id) {
      console.log(`User already has active session: ${active_session_id}`);
      return {
        success: false,
        active_session_id: active_session_id,
      };
    }

    // Later in your code, use the same fidBigInt for startNewWritingSession
    const transaction_hash = await ankyFramesgivingWalletClient.writeContract({
      account,
      address: ANKY_FRAMESGIVING_CONTRACT_ADDRESS,
      abi: ANKY_FRAMESGIVING_ABI,
      functionName: "startNewWritingSession",
      args: [fidBigInt, new_session_id, userWallet], // Use the same fidBigInt here
    });

    return {
      success: true,
      transactionHash: transaction_hash,
      sessionId: new_session_id,
      active_session_id: null,
    };
  } catch (error) {
    console.error("Error setting up writing session:", error);
    throw new Error("Failed to setup writing session on blockchain");
  }
}

async function checkIfWalletIsNotBanned(userWallet: string) {
  try {
    const isBanned = await publicClient.readContract({
      address: ANKY_FRAMESGIVING_CONTRACT_ADDRESS,
      abi: ANKY_FRAMESGIVING_ABI,
      functionName: "checkIfWalletIsBanned",
      args: [userWallet],
    });
    return isBanned;
  } catch (error) {
    return false;
  }
}

ankyFramesgivingFrame.get("/start-writing-session", async (c) => {
  console.log("Starting writing session...");
  const { fid, userWallet } = c.req.query();
  console.log(
    `Received start session request - FID: ${fid}, wallet: ${userWallet}`
  );

  if (!fid || !userWallet) {
    console.log("Missing required parameters");
    return c.json({ error: "fid and userWallet are required" }, 400);
  }

  try {
    const isUserBanned = await checkIfWalletIsNotBanned(userWallet);
    if (isUserBanned) {
      return c.json({ error: "user is banned" }, 400);
    }
    const result = await startWritingSession(fid, userWallet);
    if (result.success) {
      console.log(
        `Session started successfully. Session ID: ${result.sessionId}`
      );
      return c.json({
        session_id: result.sessionId,
        transaction_hash: result.transactionHash,
        prompt:
          "write a poem or short story about the future of ai and humanity",
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
    console.error("Error in start-writing-session endpoint:", error);
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
  metadata: string,
  userWallet: string
) {
  console.log(`Ending writing session - FID: ${fid}, Session: ${sessionId}`);
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

  const transaction_hash = await ankyFramesgivingWalletClient.writeContract({
    account,
    address: ANKY_FRAMESGIVING_CONTRACT_ADDRESS,
    abi: ANKY_FRAMESGIVING_ABI,
    functionName: "endWritingSession",
    args: [BigInt(fid), sessionId, metadata],
  });
  console.log(`Session ended, transaction hash: ${transaction_hash}`);

  return transaction_hash;
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

ankyFramesgivingFrame.post("/submit-writing-session", async (c) => {
  const { session_long_string, userWallet } = await c.req.json();
  const { fid } = c.req.query();
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
    const parsedSessionLongString = session_long_string.split("\n");
    const session_id = parsedSessionLongString[1];
    const starting_timestamp = parsedSessionLongString[3];
    const session_text = parsedSessionLongString.slice(4).join("\n");
    console.log(`Session ID: ${session_id}, Start time: ${starting_timestamp}`);

    const session_duration = Date.now() - parseInt(starting_timestamp);
    console.log(
      `Session duration: ${session_duration}ms (${session_duration / 1000}s)`
    );

    if (session_duration > 480000) {
      // 8 minutes in milliseconds
      console.log("Session duration valid, proceeding with end session flow");

      // End writing session on chain
      const endSessionTx = await endWritingSession(
        fid,
        session_id,
        session_text,
        userWallet
      );
      console.log("Writing session ended on chain");

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
