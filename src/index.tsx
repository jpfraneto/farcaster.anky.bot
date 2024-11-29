import dotenv from "dotenv";
dotenv.config();

import { Button, Frog, TextInput } from "frog";
import { devtools } from "frog/dev";
import { serveStatic } from "frog/serve-static";
import { cors } from "hono/cors";
import axios from "axios";
import {
  ID_REGISTRY_ADDRESS,
  ViemLocalEip712Signer,
  idRegistryABI,
  ID_REGISTRY_EIP_712_TYPES,
} from "@farcaster/hub-nodejs";
import { bytesToHex, createPublicClient, http } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { optimism } from "viem/chains";
import fs from "fs";
import {
  countNumberOfFids,
  fetchAllAnkyCastsAndDeleteThem,
} from "../utils/farcaster";
// fetchAllAnkyCastsAndDeleteThem();
import path from "path";
import { pinataMainTest } from "../utils/pinata";
const publicClient = createPublicClient({
  chain: optimism,
  transport: http(),
});

console.log("HEEEERE", JSON.stringify(ID_REGISTRY_EIP_712_TYPES, null, 2));

// Set up interval with error handling
// const runPinataTest = async () => {
//   try {
//     await pinataMainTest();
//   } catch (error) {
//     console.error("Error running pinataMainTest:", error);
//   } finally {
//     // Ensure interval continues even if there's an error
//     setInterval(runPinataTest, 8 * 60 * 1000); // 8 minutes
//   }
// };
// pinataMainTest();

// Start the interval loop
// import { neynar } from 'frog/hubs'
import { clankerFrame } from "./routes/clanker";
import { isUserFollowedByUser } from "./routes/clanker/functions";
import { Logger } from "../utils/Logger";
import farcasterApp from "./routes/farcaster";
import { addUserToAllowlist } from "../utils";
import {
  sendDCsToSubscribedUsers,
  shareThisTokenOnClankerChannel,
} from "../utils/farcaster";
import { upsertTokenInformationInLocalStorage } from "./storage";
import { pinata } from "frog/hubs";
import { ankyFrame } from "./routes/anky";
import { encryptString } from "../utils/crypto";
import { checkPrivyAuth } from "./middleware/privy";

export const app = new Frog({
  // Supply a Hub to enable frame verification.
  // hub: neynar({ apiKey: 'NEYNAR_FROG_FM' }),
  title: "Anky Farcaster",
});

app.use(
  "*",
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "https://farcaster.anky.bot",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Origin",
      "Content-Type",
      "Accept",
      "Authorization",
      "x-api-key",
    ],
    exposeHeaders: ["Content-Length", "X-Requested-With"],
    credentials: true,
    maxAge: 600,
  })
);

app.use("*", async (c, next) => {
  try {
    await next();
  } catch (err) {
    console.error("Server error:", err);
    return c.json(
      {
        success: false,
        message: "Internal server error",
        error: err instanceof Error ? err.message : "Unknown error",
      },
      500
    );
  }
});

app.route("/clanker", clankerFrame);
app.route("/farcaster", farcasterApp);
app.route("/anky", ankyFrame);

app.get("/test", (c) => {
  return c.json({
    message: "hello world",
  });
});

app.post("/clanker-webhook", async (c) => {
  const body = await c.req.json();
  if (Number(body.data.author.fid) !== 874542) {
    console.log("THE AUTHOR IS NOT CLANKER", body.data.author.fid);
    return c.json({
      message: "Not clanker",
      success: false,
    });
  }
  console.log("THE CLANKER WEBHOOK WAS TRIGGERED", body);
  const castHash = body.data.hash;
  const deployerFid = body.data.parent_author.fid;

  // Extract the token address from the text
  console.log("THE CAST HASH IS", castHash);
  const ethereumAddressRegex = /0x[a-fA-F0-9]{40}/;
  const tokenAddressMatch = body.data.text.match(ethereumAddressRegex);
  console.log("THE TOKEN ADDRESS MATCH IS", tokenAddressMatch);
  if (!tokenAddressMatch) {
    console.log("Could not extract token address from text");
    return c.json({
      message: "Invalid token address format",
      success: false,
    });
  }
  const token_address = tokenAddressMatch[0];
  console.log("THE TOKEN ADDRESS IS", token_address);
  Logger.info(
    `Sharing new token ${token_address} with token information for ${body.data.hash}, deployed by ${deployerFid} on /clanker`
  );
  let imageUrl, deployerUsername;
  if (token_address.length == 42 && body.data.parent_hash) {
    const options = {
      method: "GET",
      url: `https://api.neynar.com/v2/farcaster/cast?identifier=${body.data.parent_hash}&type=hash`,
      headers: {
        accept: "application/json",
        "x-neynar-experimental": "false",
        "x-api-key": process.env.NEYNAR_API_KEY,
      },
    };

    const axiosResponse = await axios.request(options);
    console.log("THE AXIOS RESPONSE IS", axiosResponse.data);
    imageUrl = axiosResponse.data?.cast?.embeds[0]?.url || "";
    deployerUsername = axiosResponse.data.cast.author.username;
    console.log("THE DEPLOYER USERNAME IS", deployerUsername);
    console.log("THE CAST HASH IS", castHash);
  }
  await upsertTokenInformationInLocalStorage({
    address: token_address,
    image_url: imageUrl,
    deployment_cast_hash: castHash,
    deployer_fid: deployerFid,
    deployer_username: deployerUsername,
    deployment_timestamp: new Date().getTime(),
  });
  const cast_hash_of_the_cast_from_anky = await shareThisTokenOnClankerChannel(
    body.data.hash,
    body.data.parent_author.fid,
    token_address,
    3,
    1000,
    body.data.parent_author.fid,
    body.data.text
  );

  // Check if body.data and body.data.text exist before trying to split
  if (!body.data?.text) {
    console.log("Missing required text data in webhook body");
    return c.json({
      message: "Missing required text data",
      success: false,
    });
  }

  // Check if the text contains the required URL pattern

  if (token_address.length == 42 && body.data.parent_hash) {
    const options = {
      method: "GET",
      url: `https://api.neynar.com/v2/farcaster/cast?identifier=${body.data.parent_hash}&type=hash`,
      headers: {
        accept: "application/json",
        "x-neynar-experimental": "false",
        "x-api-key": process.env.NEYNAR_API_KEY,
      },
    };

    const axiosResponse = await axios.request(options);
    console.log("THE AXIOS RESPONSE IS", axiosResponse.data);
    const imageUrl = axiosResponse.data?.cast?.embeds[0]?.url || "";
    const deployerUsername = axiosResponse.data.cast.author.username;
    console.log("THE DEPLOYER USERNAME IS", deployerUsername);
    console.log("THE CAST HASH IS", castHash);

    await sendDCsToSubscribedUsers(
      token_address,
      deployerUsername,
      deployerFid,
      castHash,
      imageUrl
    );
  }

  return c.json({
    message: "ok",
    success: true,
  });
});

app.frame("/", (c) => {
  return c.res({
    image: "https://github.com/jpfraneto/images/blob/main/ankkky.png?raw=true",
    intents: [<Button action="/add-to-allowlist">i want a spot</Button>],
  });
});

app.frame("/add-to-allowlist", async (c) => {
  try {
    const fid = c.frameData?.fid;
    const placeOnAllowlist = await addUserToAllowlist(fid!);
    return c.res({
      image: (
        <div tw="flex h-full w-full flex-col px-8 items-center py-4 justify-center bg-[#1E1B2E] text-white">
          <span tw="text-[#FFD700] text-7xl mb-4 font-bold text-center">
            you are on spot {placeOnAllowlist} of the allowlist
          </span>
          <span tw="text-[#9B4DCA] text-5xl mb-6 text-center">
            you could be one of only 504 chosen ones this season
          </span>
          <span tw="text-[#00BFFF] text-6xl mb-6 font-bold text-center">
            YOUR DAILY MISSION:
          </span>
          <span tw="text-[#FF69B4] text-7xl mb-4 text-center">8 MINUTES</span>
          <span tw="text-[#9B4DCA] text-6xl mb-4 text-center">
            OF PURE STREAM OF CONSCIOUSNESS WRITING
          </span>
          <span tw="text-[#FFD700] text-5xl animate-pulse text-center">
            The journey begins soon...
          </span>
        </div>
      ),
    });
  } catch (error) {
    Logger.error("Error adding user to allowlist", error);
    return c.res({
      image: (
        <div tw="flex h-full w-full flex-col px-8 items-left py-4 justify-center bg-[#1E1B2E] text-white">
          <span tw="text-[#8B7FD4] text-6xl mb-2 font-bold">error</span>
        </div>
      ),
    });
  }
});

app.frame("/anky-launch", async (c) => {
  return c.res({
    image:
      "https://github.com/jpfraneto/images/blob/main/frame_image.jpg?raw=true",
    intents: [
      <Button action="/user-research">download app</Button>,
      <Button.Link href="https://github.com/ankylat/anky">
        github repo
      </Button.Link>,
    ],
  });
});

app.frame("/anky-launch", async (c) => {
  return c.res({
    image: (
      <div tw="flex h-full w-full flex-col px-8 items-center py-4 justify-center bg-[#1E1B2E] text-white">
        <span tw="text-[#FFD700] text-6xl mb-4 font-bold text-center">
          thank you for your interest on anky
        </span>
        <span tw="text-[#9B4DCA] text-5xl mb-4 text-center">
          the mission you have on the app is to write 8 minutes every day
        </span>
        <span tw="text-[#FF69B4] text-5xl mb-4 text-center">that's all</span>
        <span tw="text-[#00BFFF] text-5xl mb-4 text-center">
          i didn't store your fid
        </span>
        <span tw="text-[#FFD700] text-5xl animate-pulse text-center">
          but stay tuned. its going to be launched soon
        </span>
      </div>
    ),
  });
});

app.post("/create-new-fid", checkPrivyAuth, async (c) => {
  const number_of_fids = await countNumberOfFids(false);
  if (number_of_fids.count == 504) {
    return c.json({
      error: "the fifth season of anky is complete",
    });
  }
  try {
    const body = await c.req.json();
    console.log("Received request body:", body);
    const { user_wallet_address } = body;
    console.log("Extracted user_wallet_address:", user_wallet_address);

    const options = {
      method: "GET",
      url: "https://api.neynar.com/v2/farcaster/user/fid",
      headers: {
        api_key: process.env.NEYNAR_API_KEY,
      },
    };
    console.log("Making request to Neynar API with options:", options);

    const data = await axios.request(options);
    console.log("Received response from Neynar API:", data);
    const new_fid = data.data.fid;
    console.log("Extracted new FID:", new_fid);

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    console.log("Calculated deadline:", deadline);

    console.log("Reading contract nonce for address:", user_wallet_address);
    const nonce = await publicClient.readContract({
      address: ID_REGISTRY_ADDRESS,
      abi: idRegistryABI,
      functionName: "nonces",
      args: [user_wallet_address as `0x${string}`],
    });
    console.log("Retrieved nonce from contract:", nonce);

    const payload = {
      new_fid: new_fid.toString(),
      deadline: deadline.toString(),
      nonce: nonce.toString(),
      address: user_wallet_address,
      number_of_fids: number_of_fids.count,
    };
    console.log("Sending successful response:", payload);
    return c.json(payload);
  } catch (error) {
    console.error("Error in /create-new-fid:", error);
    Logger.error("Error creating new fid", error);
    return c.json({
      error: "Error creating new fid",
    });
  }
});

app.post("/create-new-fid-signed-message", async (c) => {
  try {
    const body = await c.req.json();
    const { deadline, address, fid, signature, user_id } = body;
    console.log("Extracted parameters:", {
      deadline,
      address,
      fid,
      signature,
    });

    const options = {
      method: "POST",
      url: "https://api.neynar.com/v2/farcaster/user",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": process.env.NEYNAR_API_KEY,
      },
      data: {
        signature: signature,
        fid: fid,
        requested_user_custody_address: address,
        deadline: deadline,
        fname: `anky${fid}`,
      },
    };
    console.log("Sending request to Neynar API with options:", options);

    const response = await axios.request(options);
    console.log("Received response from Neynar API:", response.data);
    if (response.data.success) {
      const newUserData = {
        singer_uuid: response.data.signer.singer_uuid,
        fid: response.data.signer.fid,
        ankyUserId: user_id,
      };
      const encryptedUserData = await encryptString(
        JSON.stringify(newUserData)
      );

      const responseFromPoiesis = await axios.post(
        "https://poiesis.anky.bot/register-new-anky-user",
        {
          encryptedUserData,
        }
      );
      console.log("RESPONSE FROM POIESIS", responseFromPoiesis.data);

      return c.json({ success: true });
    }
  } catch (error: any) {
    console.error("Error in /create-new-fid-signed-message:", error);
    Logger.error("Error registering Farcaster user:", error);
    return c.json(
      {
        error: error.response?.data?.message || "Failed to register user",
      },
      500
    );
  }
});

app.use("/*", serveStatic({ root: "./public" }));
devtools(app, { serveStatic });

if (typeof Bun !== "undefined") {
  Bun.serve({
    fetch: app.fetch,
    port: 3000,
  });
  console.log("Server is running on port 3000");
}
