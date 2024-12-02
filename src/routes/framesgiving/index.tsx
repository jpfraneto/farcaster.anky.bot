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
  "0xd5E30Fb46936bE51B4302733A95933e148872af6";

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

const ankyFramesgivingWalletClient = createWalletClient({
  chain: base,
  transport: http(),
});

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
    // Create account from private key
    const account = privateKeyToAccount(
      process.env.PRIVATE_KEY as `0x${string}`
    );
    const new_session_id = crypto.randomUUID();

    // Check if user has active session
    const active_session_id = await publicClient.readContract({
      address: ANKY_FRAMESGIVING_CONTRACT_ADDRESS,
      abi: ANKY_FRAMESGIVING_ABI,
      functionName: "checkIfUserHasActiveSession",
      args: [BigInt(fid)],
    });

    if (active_session_id) {
      return {
        success: false,
        active_session_id: active_session_id,
      };
    }

    // Start new writing session
    const transaction_hash = await ankyFramesgivingWalletClient.writeContract({
      account,
      address: ANKY_FRAMESGIVING_CONTRACT_ADDRESS,
      abi: ANKY_FRAMESGIVING_ABI,
      functionName: "startNewWritingSession",
      args: [BigInt(fid), new_session_id, userWallet],
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

ankyFramesgivingFrame.get("/start-writing-session", async (c) => {
  const { fid, userWallet } = c.req.query();

  if (!fid || !userWallet) {
    return c.json({ error: "fid and userWallet are required" }, 400);
  }

  try {
    const result = await startWritingSession(fid, userWallet);
    if (result.success) {
      return c.json({
        session_id: result.sessionId,
        transaction_hash: result.transactionHash,
        prompt:
          "write a poem or short story about the future of ai and humanity",
      });
    } else {
      return c.json(
        {
          error: "the user has an active writing session that they need to end",
          active_session_id: result.active_session_id,
        },
        500
      );
    }
  } catch (error: any) {
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
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

  const transaction_hash = await ankyFramesgivingWalletClient.writeContract({
    account,
    address: ANKY_FRAMESGIVING_CONTRACT_ADDRESS,
    abi: ANKY_FRAMESGIVING_ABI,
    functionName: "endWritingSession",
    args: [BigInt(fid), sessionId, metadata],
  });

  return transaction_hash;
}

async function mintAnky(writingHash: string, userWallet: string) {
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

  const transaction_hash = await ankyFramesgivingWalletClient.writeContract({
    account,
    address: ANKY_FRAMESGIVING_CONTRACT_ADDRESS,
    abi: ANKY_FRAMESGIVING_ABI,
    functionName: "mint",
    args: [writingHash],
  });

  return transaction_hash;
}

async function generateNewAnky(session_long_string: string) {
  try {
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
    return response.data;
  } catch (error) {
    console.error("Error generating new anky:", error);
    throw new Error("Failed to generate new anky");
  }
}

ankyFramesgivingFrame.post("/end-writing-session", async (c) => {
  const { session_long_string, userWallet } = await c.req.json();
  const { fid } = c.req.query();

  if (!fid || !session_long_string || !userWallet) {
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

    const session_duration = Date.now() - parseInt(starting_timestamp);

    if (session_duration > 480000) {
      // 8 minutes in milliseconds
      // End writing session on chain
      const endSessionTx = await endWritingSession(
        fid,
        session_id,
        session_text,
        userWallet
      );

      // Generate new anky
      const ankyData = await generateNewAnky(session_long_string);

      // Mint the anky NFT
      const mintTx = await mintAnky(ankyData.writingHash, userWallet);

      return c.json({
        success: true,
        endSessionTx,
        mintTx,
        ankyData,
      });
    } else {
      return c.json(
        {
          error: "session duration must be at least 8 minutes",
          duration: session_duration,
        },
        400
      );
    }
  } catch (error: any) {
    return c.json(
      {
        error: error.message,
      },
      500
    );
  }
});
