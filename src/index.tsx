import dotenv from "dotenv";
dotenv.config();

import { Button, Frog, TextInput } from "frog";
import { devtools } from "frog/dev";
import { serveStatic } from "frog/serve-static";
import { cors } from "hono/cors";
import axios from "axios";
import { z } from "zod";
import {
  ID_REGISTRY_ADDRESS,
  ViemLocalEip712Signer,
  idRegistryABI,
  ID_REGISTRY_EIP_712_TYPES,
} from "@farcaster/hub-nodejs";
import { bytesToHex, createPublicClient, http } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import {
  SendNotificationRequest,
  sendNotificationResponseSchema,
  eventHeaderSchema,
  eventPayloadSchema,
  eventSchema,
} from "@farcaster/frame-sdk";
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
import { ankyFramesgivingFrame } from "./routes/framesgiving";

export const app = new Frog({
  // Supply a Hub to enable frame verification.
  // hub: neynar({ apiKey: 'NEYNAR_FROG_FM' }),
  title: "Anky Farcaster",
});

triggerAllUsersThatWantToBeTriggered();

async function triggerAllUsersThatWantToBeTriggered() {
  console.log("Starting sendNotificationsToUsers function");
  try {
    const notificationsPath = path.join(
      process.cwd(),
      "data/framesgiving/notifications_tokens.txt"
    );
    console.log("Notifications path:", notificationsPath);

    if (!fs.existsSync(notificationsPath)) {
      console.log("No notifications file found at path:", notificationsPath);
      return;
    }

    const fileContent = fs.readFileSync(notificationsPath, "utf-8");
    console.log("Read file content:", fileContent);

    const lines = fileContent.split("\n").filter((line) => line.trim());
    console.log("Parsed lines from file:", lines);

    for (const line of lines) {
      console.log("Processing line:", line);
      const [fid, token, url, targetUrl] = line.trim().split(" ");
      console.log("Extracted values:", { fid, token, url, targetUrl });

      const requestBody = z
        .object({
          token: z.string(),
          url: z.string(),
          targetUrl: z.string(),
        })
        .safeParse({ token, url, targetUrl });

      console.log("Validation result:", requestBody);

      if (!requestBody.success) {
        console.log(`Invalid line format: ${line}`, requestBody.error);
        continue;
      }

      try {
        console.log("Preparing to send notification request", {
          url: requestBody.data.url,
          token: requestBody.data.token,
          targetUrl: requestBody.data.targetUrl,
        });

        const response = await fetch(requestBody.data.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            notificationId: crypto.randomUUID(),
            title: "hello from anky",
            body: "this is an ongoing test notification",
            targetUrl: requestBody.data.targetUrl,
            tokens: [requestBody.data.token],
          } satisfies SendNotificationRequest),
        });

        console.log("Raw response from notification API:", response);
        const responseJson = await response.json();
        console.log("Response JSON:", responseJson);

        const responseBody =
          sendNotificationResponseSchema.safeParse(responseJson);
        console.log("Parsed response body:", responseBody);

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
  } catch (error: any) {
    console.error("Error in sendNotificationsToUsers:", error);
    console.error("Full error details:", {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
  }
  console.log("Completed sendNotificationsToUsers function");
}

app.use(
  "*",
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "https://farcaster.anky.bot",
      "https://poiesis.anky.bot",
      "https://framesgiving.anky.bot",
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
    console.log("Request received");
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
app.route("/framesgiving", ankyFramesgivingFrame);

app.get("/test", (c) => {
  return c.json({
    message: "hello world",
  });
});

app.get("/get-new-session-information", async (c) => {
  const userFid = c.req.query("fid");
  if (!userFid) {
    return c.json({
      error: "no fid provided",
    });
  }
  const upcomingPrompt = await getUpcomingPrompt(userFid);
  return c.json({
    upcomingPrompt,
  });
});

async function getUpcomingPrompt(userFid: string) {
  return "this is the new upcoming prompt";
}

app.post("/anky-webhook", async (c) => {
  const body = await c.req.json();
  if (!body.data.text.includes("@anky")) {
    console.log("ANKY WAS NOT TAGGED IN THE CAST", body.data.text);
    return c.json({
      message: "Not tagged anky",
      success: false,
    });
  }
  console.log("THE ANKY WEBHOOK WAS TRIGGERED", body);
  const castHash = body.data.hash;
  await replyToThisCastWithAnky(body.data);

  async function replyToThisCastWithAnky(castData: any) {
    const cast_text = "👽";
    const random_uuid = crypto.randomUUID();
    const options = {
      method: "POST",
      url: "https://api.neynar.com/v2/farcaster/cast",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": process.env.NEYNAR_API_KEY,
      },
      data: {
        channel_id: "anky",
        text: cast_text,
        signer_uuid: process.env.ANKY_SIGNER_UUID,
        parent_hash: castHash,
        idem: random_uuid,
        embeds: [
          {
            url: "https://framesgiving.anky.bot",
          },
        ],
      },
    };

    const response = await axios.request(options);
    const cast_hash = response.data.cast.hash;
    console.log("anky replied on this cast hash", cast_hash);
    return cast_hash;
  }

  // Extract the token address from the text
  console.log("THE CAST HASH IS", castHash);

  // let imageUrl, deployerUsername;
  // if (body.data.parent_hash) {
  //   const options = {
  //     method: "GET",
  //     url: `https://api.neynar.com/v2/farcaster/cast?identifier=${body.data.parent_hash}&type=hash`,
  //     headers: {
  //       accept: "application/json",
  //       "x-neynar-experimental": "false",
  //       "x-api-key": process.env.NEYNAR_API_KEY,
  //     },
  //   };

  //   const axiosResponse = await axios.request(options);
  //   console.log("THE AXIOS RESPONSE IS", axiosResponse.data);
  //   imageUrl = axiosResponse.data?.cast?.embeds[0]?.url || "";
  //   deployerUsername = axiosResponse.data.cast.author.username;
  //   console.log("THE DEPLOYER USERNAME IS", deployerUsername);
  //   console.log("THE CAST HASH IS", castHash);
  // }
  // await upsertTokenInformationInLocalStorage({
  //   address: token_address,
  //   image_url: imageUrl,
  //   deployment_cast_hash: castHash,
  //   deployer_fid: deployerFid,
  //   deployer_username: deployerUsername,
  //   deployment_timestamp: new Date().getTime(),
  // });
  // const cast_hash_of_the_cast_from_anky = await shareThisTokenOnClankerChannel(
  //   body.data.hash,
  //   body.data.parent_author.fid,
  //   token_address,
  //   3,
  //   1000,
  //   body.data.parent_author.fid,
  //   body.data.text
  // );

  // Check if body.data and body.data.text exist before trying to split
  // if (!body.data?.text) {
  //   console.log("Missing required text data in webhook body");
  //   return c.json({
  //     message: "Missing required text data",
  //     success: false,
  //   });
  // }

  // Check if the text contains the required URL pattern

  // if (token_address.length == 42 && body.data.parent_hash) {
  //   const options = {
  //     method: "GET",
  //     url: `https://api.neynar.com/v2/farcaster/cast?identifier=${body.data.parent_hash}&type=hash`,
  //     headers: {
  //       accept: "application/json",
  //       "x-neynar-experimental": "false",
  //       "x-api-key": process.env.NEYNAR_API_KEY,
  //     },
  //   };

  //   const axiosResponse = await axios.request(options);
  //   console.log("THE AXIOS RESPONSE IS", axiosResponse.data);
  //   const imageUrl = axiosResponse.data?.cast?.embeds[0]?.url || "";
  //   const deployerUsername = axiosResponse.data.cast.author.username;
  //   console.log("THE DEPLOYER USERNAME IS", deployerUsername);
  //   console.log("THE CAST HASH IS", castHash);

  //   await sendDCsToSubscribedUsers(
  //     token_address,
  //     deployerUsername,
  //     deployerFid,
  //     castHash,
  //     imageUrl
  //   );
  // }

  return c.json({
    message: "ok",
    success: true,
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
  // const cast_hash_of_the_cast_from_anky = await shareThisTokenOnClankerChannel(
  //   body.data.hash,
  //   body.data.parent_author.fid,
  //   token_address,
  //   3,
  //   1000,
  //   body.data.parent_author.fid,
  //   body.data.text
  // );

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

app.post("/farcaster-webhook", async (c) => {
  console.log("🎯 Received webhook request to /farcaster-webhook");

  const requestJson = await c.req.json();
  console.log("📥 Received request JSON:", requestJson);

  const requestBody = eventSchema.safeParse(requestJson);
  console.log(
    "🔍 Parsed request body result:",
    requestBody.success ? "Success" : "Failed"
  );

  if (requestBody.success === false) {
    console.log("❌ Invalid request body:", requestBody.error.errors);
    return c.json(
      { success: false, errors: requestBody.error.errors },
      { status: 400 }
    );
  }

  console.log("🎭 Decoding header from base64...");
  const headerData = JSON.parse(
    Buffer.from(requestBody.data.header, "base64url").toString("utf-8")
  );
  console.log("📋 Decoded header data:", headerData);

  const header = eventHeaderSchema.safeParse(headerData);
  console.log(
    "🔍 Header validation result:",
    header.success ? "Success" : "Failed"
  );

  if (header.success === false) {
    console.log("❌ Invalid header:", header.error.errors);
    return c.json(
      { success: false, errors: header.error.errors },
      { status: 400 }
    );
  }
  const fid = header.data.fid;
  console.log("👤 FID from header:", fid);

  console.log("🎭 Decoding payload from base64...");
  const payloadData = JSON.parse(
    Buffer.from(requestBody.data.payload, "base64url").toString("utf-8")
  );
  console.log("📦 Decoded payload data:", payloadData);

  const payload = eventPayloadSchema.safeParse(payloadData);
  console.log(
    "🔍 Payload validation result:",
    payload.success ? "Success" : "Failed"
  );

  if (payload.success === false) {
    console.log("❌ Invalid payload:", payload.error.errors);
    return c.json(
      { success: false, errors: payload.error.errors },
      { status: 400 }
    );
  }

  console.log("🔄 Processing event type:", payload.data.event);
  switch (payload.data.event) {
    case "frame-added":
      console.log("➕ Frame Added Event!");
      console.log(
        payload.data.notificationDetails
          ? `🔔 Got frame-added event for fid ${fid} with notification token ${payload.data.notificationDetails.token} and url ${payload.data.notificationDetails.url}`
          : `🤫 Got frame-added event for fid ${fid} with no notification details`
      );
      break;
    case "frame-removed":
      console.log(`➖ Got frame-removed event for fid ${fid}`);
      break;
    case "notifications-enabled":
      console.log("🔔 Notifications Enabled Event!");
      console.log(
        `📱 Got notifications-enabled event for fid ${fid} with token ${
          payload.data.notificationDetails.token
        } and url ${payload.data.notificationDetails.url} ${JSON.stringify(
          payload.data
        )}`
      );
      break;
    case "notifications-disabled":
      console.log(`🔕 Got notifications-disabled event for fid ${fid}`);
      break;
  }

  console.log("✅ Successfully processed webhook");
  return c.json({ success: true });
});

app.post("/register-user-for-notifications", async (c) => {
  const body = await c.req.json();
  const { fid, token, url, targetUrl } = body;
  console.log("Registering user for notifications:", body);

  try {
    const notificationsPath = path.join(
      process.cwd(),
      "data/framesgiving/notifications_tokens.txt"
    );

    // Create directory if it doesn't exist
    const dir = path.dirname(notificationsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Check if file exists, if not create it
    if (!fs.existsSync(notificationsPath)) {
      fs.writeFileSync(notificationsPath, "");
    }

    // Read existing notifications
    const existingData = fs.readFileSync(notificationsPath, "utf-8");
    const existingTokens = existingData
      .split("\n")
      .filter((line) => line.trim());

    // Check if token already exists
    const tokenExists = existingTokens.some((line) => {
      const [existingFid, existingToken] = line.split(" ");
      return existingFid === fid.toString() && existingToken === token;
    });

    if (tokenExists) {
      return c.json({
        success: false,
        message: "User already registered for notifications",
      });
    }

    // Append the notification data
    fs.appendFileSync(
      notificationsPath,
      `${existingData ? "\n" : ""}${fid} ${token} ${url} ${targetUrl}`
    );

    return c.json({
      success: true,
      message: "Successfully registered for notifications",
    });
  } catch (error) {
    console.error("Error registering for notifications:", error);
    return c.json(
      {
        success: false,
        error: "Failed to register for notifications",
      },
      500
    );
  }
});

app.get("/.well-known/farcaster.json", (c) => {
  return c.json({
    accountAssociation: {
      header: process.env.FARCASTER_HEADER,
      payload: process.env.FARCASTER_PAYLOAD,
      signature: process.env.FARCASTER_SIGNATURE,
    },
    frame: {
      name: "Anky",
      version: "0.0.1",
      iconUrl:
        "https://raw.githubusercontent.com/jpfraneto/images/refs/heads/main/splash222.png",
      homeUrl: "https://framesgiving.anky.bot",
      splashImageUrl:
        "https://raw.githubusercontent.com/jpfraneto/images/refs/heads/main/splash222.png",
      splashBackgroundColor: "#9D00FF",
      webhookUrl: "https://farcaster.anky.bot/farcaster-webhook",
    },
  });
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
