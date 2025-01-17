import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { Frog } from "frog";
import { Logger } from "../../../utils/Logger";
import fs from "fs";
import { Cast } from "../../types/farcaster";
import axios from "axios";
import weeklyhackathon_abi from "./weeklyhackathon_abi.json";
import weeklyhackathonVoting_abi from "./weeklyhackathonVoting_abi.json";
import {
  uploadImageToPinata,
  uploadMetadataToPinata,
  uploadSvgToPinata,
} from "../../../utils/pinata";
import { privateKeyToAccount } from "viem/accounts";
import clanker_v2_abi from "./clanker_v2_abi.json";
import { createPublicClient, decodeEventLog, encodeFunctionData } from "viem";
import { http } from "viem";
import { createWalletClient } from "viem";
import { base } from "viem/chains";
import { preparePassport } from "./functions";
import sharp from "sharp";

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

const weeklyhackathonWalletClient = createWalletClient({
  chain: base,
  transport: http(),
});

const HACKATHON_TOKEN_CONTRACT_ADDRESS =
  "0x3dF58A5737130FdC180D360dDd3EFBa34e5801cb";
const WEEKLY_HACKATHON_CONTRACT_ADDRESS =
  "0x9D341F2dBB7b77f77C051CbBF348F4BF5C858Fab";

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

export const weeklyHackathonFrame = new Frog({
  title: "weeklyhackathon",
  imageOptions,
  imageAspectRatio: "1:1",
});

weeklyHackathonFrame.use(async (c, next) => {
  Logger.info(`[${c.req.method}] : : :  ${c.req.url}`);
  c.res.headers.set("Cache-Control", "max-age=0");
  await next();
});

weeklyHackathonFrame.post("/prepare-passport", async (c) => {
  console.log("Starting /prepare-passport endpoint");
  const body = await c.req.json();
  console.log("Received request body:", body);
  const { fid, address } = body;
  console.log("Extracted fid:", fid);

  const hackerPassBalance = (await publicClient.readContract({
    address: WEEKLY_HACKATHON_CONTRACT_ADDRESS,
    abi: weeklyhackathon_abi,
    functionName: "balanceOf",
    args: [address],
  })) as bigint;

  // check if the address owns more than 88888 $hackathon
  const balance = (await publicClient.readContract({
    address: HACKATHON_TOKEN_CONTRACT_ADDRESS,
    abi: clanker_v2_abi,
    functionName: "balanceOf",
    args: [address],
  })) as bigint;
  console.log("THE BALANCE IS", balance);
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

  if (balance < 88888n) {
    // If not, send 88889 $hackathon to address so that they can mint a hacker pass
    try {
      const transaction_hash = await weeklyhackathonWalletClient.writeContract({
        account,
        address: HACKATHON_TOKEN_CONTRACT_ADDRESS,
        abi: clanker_v2_abi,
        functionName: "transfer",
        args: [address, 88889n],
      });

      console.log(
        `💸 Sent 88,889 $HACKATHON tokens to ${address} tx hash:`,
        transaction_hash
      );

      await publicClient.waitForTransactionReceipt({
        hash: transaction_hash,
      });
    } catch (error) {
      console.error("Error sending $HACKATHON tokens:", error);
      return c.json(
        {
          message:
            "You need at least 88,888 $HACKATHON tokens to mint a passport",
          currentBalance: balance.toString(),
        },
        400
      );
    }
  }

  const [isAllowed, reservedTokenId, preMintMetadata, hackerProfile, isMinted] =
    (await publicClient.readContract({
      address: WEEKLY_HACKATHON_CONTRACT_ADDRESS,
      abi: weeklyhackathon_abi,
      functionName: "getFidMetadata",
      args: [fid],
    })) as [
      boolean, // isAllowed
      bigint, // reservedTokenId
      { passportImageUrl: string; username: string }, // preMintMetadata
      {
        fid: bigint;
        passportImageUrl: string;
        username: string;
        projectIds: bigint[];
        hasPassport: boolean;
        wins: bigint;
        finalistBadges: bigint;
      }, // hackerProfile
      boolean // isMinted
    ];

  console.log("Checking FID status:", { isAllowed, isMinted });
  const passportStatus = {
    status: {
      isAllowed,
      isMinted,
      canMint: isAllowed && !isMinted,
    },
    reservedTokenId: reservedTokenId.toString(),
    preMintData: {
      imageUrl: preMintMetadata.passportImageUrl,
      username: preMintMetadata.username,
    },
    hackerProfile: isMinted
      ? {
          fid: hackerProfile.fid.toString(),
          imageUrl: hackerProfile.passportImageUrl,
          username: hackerProfile.username,
          projects: hackerProfile.projectIds.map((id) => id.toString()),
          hasPassport: hackerProfile.hasPassport,
          achievements: {
            wins: hackerProfile.wins.toString(),
            finalistBadges: hackerProfile.finalistBadges.toString(),
          },
        }
      : null,
  };
  console.log("passportStatus", passportStatus);
  if (isAllowed) {
    return c.json({
      success: false,
      message: "FID already registered for Weekly Hackathon",
      data: passportStatus,
    });
  }
  console.log("THE BALANCE IS", hackerPassBalance);
  if (hackerPassBalance > 0n) {
    return c.json({
      success: false,
      message: "You already own a hacker pass",
      data: passportStatus,
    });
  }

  console.log("Calling preparePassport function...");
  const passport = await preparePassport(
    fid.toString(),
    address,
    reservedTokenId
  );
  console.log("Passport generated successfully:", passport);

  const transaction_hash = await weeklyhackathonWalletClient.writeContract({
    account,
    address: WEEKLY_HACKATHON_CONTRACT_ADDRESS,
    abi: weeklyhackathon_abi,
    functionName: "allowFid",
    args: [fid, passport.image_url, passport.username],
  });

  console.log("💫 Transaction hash received:", transaction_hash);

  console.log("⏳ Waiting for transaction receipt");
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: transaction_hash,
  });

  console.log(
    "UNTIL HERE WE SHOULD BE GOOD. THE TOKEN SHOULD BE CREATED",
    receipt
  );

  console.log("Returning passport data to frontend");
  // return the information for the frontent so that the user can mint their passport. image_url, smart_contract_calldata, etc.
  return c.json({ passport });
});

weeklyHackathonFrame.get("/", (c) => {
  console.log("weeklyhackathon");

  // Get current time and next Thursday 23:59 UTC
  const now = new Date();
  const nextThursday = new Date();
  nextThursday.setUTCDate(
    nextThursday.getUTCDate() + ((4 + 7 - nextThursday.getUTCDay()) % 7)
  );
  nextThursday.setUTCHours(23, 59, 0, 0);

  // Calculate time remaining
  const timeRemaining = nextThursday.getTime() - now.getTime();
  const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
  const hours = Math.floor(
    (timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
  );
  const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));

  return c.html(`
    <div style="text-align: center; font-family: sans-serif;">
      <h1>Weekly Hackathon</h1>
      <div style="font-size: 24px; margin: 20px;">
        ${days}d ${hours}h ${minutes}m
      </div>
      <p>Next deadline: ${nextThursday.toUTCString()}</p>
    </div>
  `);
});

const WEEKLY_HACKATHON_VOTING_CONTRACT_ADDRESS =
  "0xDa6C7433A10881054A9F3d430D6C3A68658b16cd";

weeklyHackathonFrame.post("/upload-svg", async (c) => {
  try {
    console.log("📤 Starting /upload-svg endpoint");
    const body = await c.req.json();
    console.log("Received request body:", body);

    const { svg, voteString, address, fid } = body;
    console.log("Extracted data:", { voteString, address, fid });
    console.log("SVG length:", svg.length);
    if (svg.length === 0 || voteString.length === 0) {
      return c.json({ error: "SVG or vote string is empty" }, 400);
    }

    // check if the address owns more than 88888 $hackathon
    const isWhitelisted = (await publicClient.readContract({
      address: WEEKLY_HACKATHON_VOTING_CONTRACT_ADDRESS,
      abi: weeklyhackathonVoting_abi,
      functionName: "isWhitelisted",
      args: [address],
    })) as boolean;

    if (!isWhitelisted) {
      const account = privateKeyToAccount(
        process.env.PRIVATE_KEY as `0x${string}`
      );

      const transaction_hash = await weeklyhackathonWalletClient.writeContract({
        account,
        address: WEEKLY_HACKATHON_VOTING_CONTRACT_ADDRESS,
        abi: weeklyhackathonVoting_abi,
        functionName: "whitelistVoter",
        args: [address, BigInt(fid)],
      });

      console.log(
        `🗳️ Whitelisted voter ${address} with fid ${fid}, tx hash:`,
        transaction_hash
      );

      await publicClient.waitForTransactionReceipt({
        hash: transaction_hash,
      });
    }

    console.log("⏳ Converting SVG to PNG...");
    const decodedSvg = decodeURI(svg);
    console.log("DECODED SVG", decodedSvg);
    const pngBuffer = await sharp(Buffer.from(decodedSvg)).png().toBuffer();

    // Create temporary file path
    const tempFilePath = `/tmp/vote-${Date.now()}.png`;

    // Write PNG buffer to temporary file
    await fs.promises.writeFile(tempFilePath, pngBuffer);

    console.log("⏳ Uploading PNG to Pinata...");
    const imageIpfsHash = await uploadImageToPinata(tempFilePath);
    console.log("✅ PNG uploaded with hash:", imageIpfsHash);

    // Clean up temporary file
    await fs.promises.unlink(tempFilePath);

    const metadata = {
      image: `ipfs://${imageIpfsHash}`,
      name: "Weekly Hackathon Vote",
      description: "Weekly Hackathon Vote casted by " + fid,
      attributes: {
        vote_string: voteString,
      },
    };
    console.log("📝 Prepared metadata:", metadata);

    console.log("⏳ Uploading metadata to Pinata...");
    const metadataIpfsHash = await uploadMetadataToPinata(metadata);
    console.log("✅ Metadata uploaded with hash:", metadataIpfsHash);

    console.log("🎉 Upload complete, returning hashes");
    return c.json({ metadataIpfsHash, imageIpfsHash });
  } catch (error) {
    console.log("ERROR", error);
    return c.json({ error: "Error uploading SVG or metadata" }, 500);
  }
});

weeklyHackathonFrame.post("/framesv2-webhook", async (c) => {
  console.log("📨 Received framesv2 webhook");
  const webhookData = await c.req.json();
  console.log("the webhook da ta is", webhookData);
  return c.json({
    success: true,
  });
});
