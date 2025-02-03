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
import { prepareKycPass, preparePassport } from "./functions";
import sharp from "sharp";
import { createCanvas } from "canvas";

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
const WEEKLY_HACKATHON_VOTING_CONTRACT_ADDRESS =
  "0xb08806a1c22bf9c06dfa73296fb17a14d9cfc63b";

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

weeklyHackathonFrame.post("/prepare-kyc-pass", async (c) => {
  console.log("Starting /prepare-kyc-pass endpoint");
  const body = await c.req.json();
  console.log("Received request body:", body);
  const { fid, address } = body;
  console.log("Extracted fid:", fid);

  const kycPassBalance = (await publicClient.readContract({
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

  if (balance < 15000000n) {
    // If not, send 15000000n $fed to address so that they can mint a hacker pass
    return c.json(
      {
        message: "You need at least 15000000 $FED tokens to mint a KYC pass",
        currentBalance: balance.toString(),
      },
      400
    );
  }

  console.log("THE BALANCE IS", kycPassBalance);
  if (kycPassBalance > 0n) {
    return c.json({
      success: false,
      message: "You already own a kyc pass",
    });
  }

  console.log("Calling preparePassport function...");

  const passport = await prepareKycPass(fid.toString(), address);

  console.log("Passport generated successfully:", passport);

  const transaction_hash = await weeklyhackathonWalletClient.writeContract({
    account,
    address: WEEKLY_HACKATHON_CONTRACT_ADDRESS,
    abi: weeklyhackathon_abi,
    functionName: "allowFid",
    args: [fid, passport.image_hash],
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

weeklyHackathonFrame.post("/prepare-vote", async (c) => {
  try {
    console.log("📤 Starting /upload-svg endpoint");
    const body = await c.req.json();
    console.log("Received request body:", body);

    const { vote, address, fid } = body;
    console.log("Extracted data:", { vote, address, fid });

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

    console.log("⏳ Converting vote to PNG...");
    const imageIpfsHash = await fromVoteToImageIpfsHash(vote);

    const metadata = {
      image: `ipfs://${imageIpfsHash}`,
      name: "Weekly Hackathon Vote",
      description: "Weekly Hackathon Vote casted by " + fid,
      attributes: {
        vote_string: vote,
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

async function fromVoteToImageIpfsHash(vote: string) {
  try {
    console.log("🎨 Starting vote modification process...");

    // Read the base SVG template
    console.log("Reading SVG template...");
    const svgTemplate = await fs.promises.readFile(
      "./src/routes/weeklyhackathon/assets/editable_vote.svg",
      "utf-8"
    );

    // Parse vote string into array of numbers
    const votes = vote.toString().split("").map(Number);
    console.log("🗳️ Vote array:", votes);

    let modifiedSVG = svgTemplate;

    // Replace placeholders with actual usernames
    for (let i = 0; i < votes.length; i++) {
      const voteNumber = votes[i];
      const finalist = weekOneFinalists.find(
        (f) => f.submission_place === voteNumber
      );

      if (finalist) {
        console.log(`🔄 Processing vote ${i + 1} for @${finalist.username}`);

        // Replace the XXXXXXXX placeholder for this position
        const placeholder = "XXXXXXXX";
        modifiedSVG = modifiedSVG.replace(placeholder, `@${finalist.username}`);
      }
    }

    // Save modified SVG to temporary file
    const tempSvgPath = `./${vote}_vote.svg`;
    await fs.promises.writeFile(tempSvgPath, modifiedSVG);

    // Upload SVG file to Pinata
    console.log("⏳ Uploading SVG to Pinata...");
    const imageIpfsHash = await uploadImageToPinata(tempSvgPath);
    console.log("✅ SVG uploaded with hash:", imageIpfsHash);

    // Clean up temporary file
    await fs.promises.unlink(tempSvgPath);

    return imageIpfsHash;
  } catch (error) {
    console.error("❌ Error in fromVoteToImageIpfsHash:", error);
    throw error;
  }
}

export interface HackathonFinalist {
  username: string;
  fid: number;
  pfp_url: string;
  display_name: string;
  project_url: string;
  github_url: string;
  demo_url: string;
  submission_place: number;
}

const weekOneFinalists: HackathonFinalist[] = [
  {
    username: "jvaleska.eth",
    fid: 13505,
    pfp_url:
      "https://imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/f82ddc2b-1c48-4e8f-61b3-e40eb4d59700/original",
    display_name: "J. Valeska 🦊🎩🫂 ",
    project_url: "https://farcaster-frames-v2-demo.vercel.app",
    github_url: "https://github.com/jvaleskadevs/farcaster-frames-v2-demo",
    demo_url: "https://www.youtube.com/shorts/n6TVlqgExRo",
    submission_place: 1,
  },
  {
    username: "hellno.eth",
    fid: 13596,
    pfp_url: "https://i.imgur.com/qoHFjQD.gif",
    display_name: "hellno the optimist",
    project_url: "https://farcasterframeception.vercel.app",
    github_url: "https://github.com/hellno/frameception",
    demo_url: "https://vimeo.com/1047553467/af29b86b8e?share=copy",
    submission_place: 2,
  },
  {
    username: "cashlessman.eth",
    fid: 268438,
    pfp_url:
      "https://imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/a74b030e-2d92-405c-c2d0-1696f5d51d00/original",
    display_name: "cashlessman 🎩",
    project_url: "https://hackathon-bay-seven.vercel.app",
    github_url: "https://github.com/cashlessman/HACKATHON",
    demo_url: "https://youtube.com/shorts/6L9oX98xFmk",
    submission_place: 3,
  },
  {
    username: "shomari.eth",
    fid: 870594,
    pfp_url:
      "https://imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/57f8600f-2e51-4549-8cc4-f80e4c681800/rectcrop3",
    display_name: "Shomari",
    project_url: "https://frameify.xyz",
    github_url: "https://github.com/castrguru/frameify",
    demo_url: "https://youtube.com/shorts/_ZWLzTZ0DGs",
    submission_place: 4,
  },
  {
    username: "breck",
    fid: 158,
    pfp_url:
      "https://imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/bebf2f70-37fa-4114-9720-3bdc32f72a00/original",
    display_name: "Breck Yunits",
    project_url: "https://framehub.pro",
    github_url: "https://github.com/breck7/week-1",
    demo_url: "https://www.youtube.com/watch?v=3T6jUOJLWTw",
    submission_place: 5,
  },
  {
    username: "dalresin",
    fid: 422333,
    pfp_url: "https://i.imgur.com/Gtrkty9.jpg",
    display_name: "Lord Dalresin🐝",
    project_url: "https://builder.dbee.be",
    github_url: "https://github.com/ysalitrynskyi/week-1",
    demo_url: "https://www.youtube.com/watch?v=7aRn3yEszIU",
    submission_place: 6,
  },
  {
    username: "boredhead",
    fid: 6861,
    pfp_url: "https://i.imgur.com/P7utvMt.jpg",
    display_name: "kt 🤠",
    project_url: "https://next-frame-psi.vercel.app",
    github_url: "https://github.com/kirtirajsinh/framexperiment",
    demo_url: "https://youtu.be/bZfYeDcB2N8",
    submission_place: 7,
  },
  {
    username: "itsmide.eth",
    fid: 262800,
    pfp_url: "https://i.imgur.com/96rdcWp.jpg",
    display_name: "mide (aka fraye)",
    project_url: "https://frames-v2.builders.garden",
    github_url: "https://github.com/builders-garden/frames-v2-showcase",
    demo_url: "https://www.youtube.com/watch?v=TXDSIAL1q_s",
    submission_place: 8,
  },
];

weeklyHackathonFrame.get("/gh-webhook", async (c) => {
  try {
    console.log("Received GitHub webhook");
    const body = await c.req.json();
    console.log("the body is", body);
    return c.json({
      success: true,
    });
  } catch (error) {
    console.log("there was an error on the github webhook of $hackathon");
  }
});

weeklyHackathonFrame.post("/generate-frame-from-prompt", async (c) => {
  const body = await c.req.json();

  try {
    const requestBody = JSON.stringify({
      model: "chatgpt-4o-latest",
      messages: [
        {
          role: "system",
          content: `You are a helpful AI assistant specialized in generating static html code (with its corresponding css and js). 
            
Please analyze the following prompt and generate appropriate static html code.

Return a JSON object in this format:
{
  "html": string // The generated HTML code
}

The HTML code should:
- Be valid HTML
- Include any necessary styling and functionality, in accordance to being a fully functional response to what the user asked for
`,
        },
        {
          role: "user",
          content: body.prompt,
        },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const aiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: requestBody,
      }
    );

    if (!aiResponse.ok) {
      const errorData = await aiResponse.json();
      throw new Error(
        `OpenAI API error: ${errorData.error?.message || "Unknown error"}`
      );
    }

    const aiData = await aiResponse.json();
    const generatedCode = JSON.parse(aiData.choices[0].message.content);

    return c.json({
      success: true,
      code: generatedCode.html,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: "Failed to generate frame code",
      },
      500
    );
  }
});

weeklyHackathonFrame.post("/publish-static-html-through-orbiter", async (c) => {
  const body = await c.req.json();
  console.log("the body is", body);

  const orbiterResponse = await publishStaticHtmlThroughOrbiter(
    body.rawHtmlCode
  );
  return c.json({
    success: true,
  });
});

async function publishStaticHtmlThroughOrbiter(rawHtmlCode: string) {
  // ??????
  console.log("inside the publishStaticHtmlThroughOrbiter function");
  console.log("the raw html code is", rawHtmlCode);
  return "https://random-generated-url.orbiter.host";
}
