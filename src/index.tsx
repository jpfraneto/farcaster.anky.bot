import dotenv from "dotenv";
dotenv.config();

import { Button, Frog, TextInput } from "frog";
import { devtools } from "frog/dev";
import { serveStatic } from "frog/serve-static";
import { cors } from "hono/cors";
import axios from "axios";
import fs from "fs";
import path from "path";
import { pinataMainTest } from "../utils/pinata";
pinataMainTest();
setInterval(async () => {
  try {
    await pinataMainTest();
  } catch (error) {
    console.error("Error running pinataMainTest:", error);
  }
}, 8 * 60 * 1000); // 8 minutes in milliseconds
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

    await upsertTokenInformationInLocalStorage({
      address: token_address,
      image_url: imageUrl,
      deployment_cast_hash: castHash,
      deployer_fid: deployerFid,
      deployer_username: deployerUsername,
      deployment_timestamp: new Date().getTime(),
    });

    await sendDCsToSubscribedUsers(
      token_address,
      deployerUsername,
      deployerFid,
      castHash,
      imageUrl,
      cast_hash_of_the_cast_from_anky
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
    intents: [<Button value="/add-to-allowlist">i want a spot</Button>],
  });
});

app.frame("/add-to-allowlist", async (c) => {
  try {
    const fid = c.frameData?.fid;
    const placeOnAllowlist = await addUserToAllowlist(fid!);
    return c.res({
      image: (
        <div tw="flex h-full w-full flex-col px-8 items-left py-4 justify-center bg-[#1E1B2E] text-white">
          <span tw="text-[#8B7FD4] text-6xl mb-2 font-bold">
            you are on the allowlist, on spot {placeOnAllowlist}
          </span>
          <span tw="text-[#A5A1D3] text-6xl mb-2">
            only 504 people will be able to create an account for this season
          </span>
          <span tw="text-[#6A5FAC] text-6xl mb-2">
            your mission is to write a stream of consciousness, every day
          </span>
          <span tw="text-[#534989] text-6xl mb-2">for 8 minutes</span>
          <span tw="text-[#534989] text-4xl mb-2">stay tuned</span>
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

app.use("/*", serveStatic({ root: "./public" }));
devtools(app, { serveStatic });

if (typeof Bun !== "undefined") {
  Bun.serve({
    fetch: app.fetch,
    port: 3000,
  });
  console.log("Server is running on port 3000");
}
