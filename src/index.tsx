import dotenv from "dotenv";
dotenv.config();

import { Button, Frog, TextInput } from "frog";
import { devtools } from "frog/dev";
import { serveStatic } from "frog/serve-static";
import { cors } from "hono/cors";
import axios from "axios";
import { z } from "zod";
import { ID_REGISTRY_ADDRESS, idRegistryABI } from "@farcaster/hub-nodejs";
import { createPublicClient, http } from "viem";
import {
  ParseWebhookEvent,
  parseWebhookEvent,
  verifyAppKeyWithNeynar,
} from "@farcaster/frame-node";
import { optimism } from "viem/chains";
import fs from "fs";
import { countNumberOfFids, getAnkyFeed } from "../utils/farcaster";

import path from "path";
const publicClient = createPublicClient({
  chain: optimism,
  transport: http(),
});

import { clankerFrame } from "./routes/clanker";
import { Logger } from "../utils/Logger";
import { addUserToAllowlist } from "../utils";
import { sendDCsToSubscribedUsers } from "../utils/farcaster";
import { upsertTokenInformationInLocalStorage } from "./storage";
import { farbarterFrame } from "./routes/farbarter";
import { weeklyHackathonFrame } from "./routes/weeklyhackathon";
import { checkPrivyAuth } from "./middleware/privy";

import {
  ankyFramesgivingFrame,
  getUpcomingPromptForUser,
} from "./routes/framesgiving";
import {
  checkUserWritingStatus,
  deleteUserNotificationDetails,
  getAllNotificationUsers,
  getUserNotificationDetails,
  sendFrameNotification,
  setUserNotificationDetails,
} from "../utils/notifications";
import {
  getCurrentAnkyverseDay,
  startAnkyverseScheduler,
} from "../utils/ankyverse";
import { encryptString } from "../utils/crypto";

export const app = new Frog({
  // Supply a Hub to enable frame verification.
  // hub: neynar({ apiKey: 'NEYNAR_FROG_FM' }),
  title: "Anky Farcaster",
});

// startNotificationScheduler();
startAnkyverseScheduler();

app.use(
  "*",
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "https://farcaster.anky.bot",
      "https://framesgiving.anky.bot",
      "https://farbarter.orbiter.website",
      "https://farbarter.com",
      "https://www.farbarter.com",
      "https://weeklyhackathon.com",
      "https://www.weeklyhackathon.com",
      "https://testing.weeklyhackathon.com",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Origin",
      "Content-Type",
      "Accept",
      "Authorization",
      "x-api-key",
      // Add any additional headers your requests might use
    ],
    exposeHeaders: ["Content-Length", "X-Requested-With"],
    credentials: true,
    maxAge: 600,
  })
);

app.use("*", async (c, next) => {
  try {
    console.log(`[${c.req.method}] ${c.req.url}`);
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
app.route("/framesgiving", ankyFramesgivingFrame);
app.route("/farbarter", farbarterFrame);
app.route("/weeklyhackathon", weeklyHackathonFrame);

app.get("/test", (c) => {
  return c.json({
    message: "hello world",
  });
});

// //farcaster.anky.bot/farcaster/user/bulk?fids=1%2C2%2C3%2C4%2C

app.get("/farcaster/user/bulk", async (c) => {
  try {
    const fids = c.req.query("fids");
    if (!fids) {
      return c.json({
        error: "no fids provided",
      });
    }

    const options = {
      method: "GET",
      url: `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fids}`,
      headers: {
        accept: "application/json",
        "x-neynar-experimental": "false",
        "x-api-key": process.env.NEYNAR_API_KEY || "",
      },
    };

    const response = await axios.request(options);
    return c.json(response.data);
  } catch (error) {
    console.error("Error in farcaster/user/bulk:", error);
    return c.json({
      error: "Internal server error",
    });
  }
});

app.get("/notifications/check", async (c) => {
  try {
    const currentDay = getCurrentAnkyverseDay();
    const users = await getAllNotificationUsers();

    const userStatuses = await Promise.all(
      users.map(async (fid) => {
        try {
          const status = await checkUserWritingStatus(fid);
          return {
            fid,
            status,
            notificationDetails: await getUserNotificationDetails(fid),
          };
        } catch (error: any) {
          return {
            fid,
            error: error.message,
          };
        }
      })
    );

    // Create HTML response
    const html = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Anky Notification Status</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              max-width: 1200px;
              margin: 0 auto;
              padding: 20px;
              background: #f5f5f5;
            }
            .container {
              background: white;
              padding: 20px;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .ankyverse-day {
              background: ${currentDay.currentColor.main};
              color: ${currentDay.currentColor.textColor};
              padding: 20px;
              border-radius: 8px;
              margin-bottom: 20px;
            }
            .user-grid {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
              gap: 20px;
              margin-top: 20px;
            }
            .user-card {
              background: white;
              padding: 15px;
              border-radius: 8px;
              border: 1px solid #eee;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .status-indicator {
              display: inline-block;
              width: 10px;
              height: 10px;
              border-radius: 50%;
              margin-right: 8px;
            }
            .status-written {
              background: #22c55e;
            }
            .status-pending {
              background: #eab308;
            }
            .status-error {
              background: #ef4444;
            }
            .refresh-time {
              text-align: right;
              color: #666;
              font-size: 0.875rem;
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="ankyverse-day">
              <h1>Ankyverse Day Status</h1>
              <p>Current Sojourn: ${currentDay.currentSojourn}</p>
              <p>Current Kingdom: ${currentDay.currentKingdom}</p>
              <p>Status: ${currentDay.status}</p>
              ${
                currentDay.wink ? `<p>Current Wink: ${currentDay.wink}</p>` : ""
              }
            </div>

            <h2>Notification Status (${users.length} users)</h2>

            <div class="user-grid">
              ${userStatuses
                .map(
                  (user) => `
                <div class="user-card">
                  ${
                    user.error
                      ? `
                    <div>
                      <span class="status-indicator status-error"></span>
                      <strong>FID: ${user.fid}</strong>
                      <p style="color: #ef4444;">Error: ${user.error}</p>
                    </div>
                  `
                      : `
                    <div>
                      <span class="status-indicator ${
                        user.status?.hasWrittenToday
                          ? "status-written"
                          : "status-pending"
                      }"></span>
                      <strong>FID: ${user.fid}</strong>
                      <p>Written Today: ${
                        user.status?.hasWrittenToday ? "Yes" : "No"
                      }</p>
                      <p>Last Writing: ${new Date(
                        user.status?.lastWritingTimestamp ?? 0
                      ).toLocaleString()}</p>
                      ${
                        user.notificationDetails
                          ? `
                        <p style="font-size: 0.875rem; color: #666;">
                          Notifications enabled
                        </p>
                      `
                          : ""
                      }
                    </div>
                  `
                  }
                </div>
              `
                )
                .join("")}
            </div>

            <p class="refresh-time">Last checked: ${new Date().toLocaleString()}</p>
          </div>
        </body>
      </html>
    `;

    return c.html(html);
  } catch (error: any) {
    console.error("Error in notification status check:", error);
    return c.html(`
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Error checking notification status</h1>
          <pre>${error.stack}</pre>
        </body>
      </html>
    `);
  }
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
    return c.json({
      message: "Not tagged anky",
      success: false,
    });
  }
  if ([883378].includes(body.data.author.fid)) {
    return c.json({
      message: "banned bot",
      success: false,
    });
  }
  const secondUserTagged = body.data.text
    .split("@anky")[1]
    ?.split(" ")
    .find((word: string) => word.startsWith("@"))
    ?.slice(1);
  const castHash = body.data.hash;

  if (secondUserTagged) {
  }

  // const this_cast = body.data;
  await replyToThisCastWithAnky(body.data);

  async function replyToThisCastWithAnky(cast: any) {
    let reply_text = await getUpcomingPromptForUser(cast.author.fid);
    if (reply_text.length > 100) reply_text = "";
    const formatted_reply_text = encodeURIComponent(reply_text);
    // const anky_reply_information = await getAnkyReplyInformationForCast(cast);
    // const cast_text = reply_text ?? "hello world 👽";
    const cast_text = "hello world 👽";
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
        text: cast_text,
        signer_uuid: process.env.ANKY_SIGNER_UUID,
        parent: castHash,
        idem: random_uuid,
        embeds: [
          {
            url: reply_text
              ? `https://framesgiving.anky.bot?prompt=${formatted_reply_text}`
              : "https://framesgiving.anky.bot",
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
    return c.json({
      message: "Not clanker",
      success: false,
    });
  }
  const castHash = body.data.hash;
  const deployerFid = body.data.parent_author.fid;

  // Extract the token address from the text
  const ethereumAddressRegex = /0x[a-fA-F0-9]{40}/;
  const tokenAddressMatch = body.data.text.match(ethereumAddressRegex);
  if (!tokenAddressMatch) {
    console.log("Could not extract token address from text");
    return c.json({
      message: "Invalid token address format",
      success: false,
    });
  }
  const token_address = tokenAddressMatch[0];
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
    imageUrl = axiosResponse.data?.cast?.embeds[0]?.url || "";
    deployerUsername = axiosResponse.data.cast.author.username;
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
    const imageUrl = axiosResponse.data?.cast?.embeds[0]?.url || "";
    const deployerUsername = axiosResponse.data.cast.author.username;

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
    const { user_wallet_address } = body;

    const options = {
      method: "GET",
      url: "https://api.neynar.com/v2/farcaster/user/fid",
      headers: {
        api_key: process.env.NEYNAR_API_KEY,
      },
    };

    const data = await axios.request(options);
    const new_fid = data.data.fid;

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    console.log("Reading contract nonce for address:", user_wallet_address);
    const nonce = await publicClient.readContract({
      address: ID_REGISTRY_ADDRESS,
      abi: idRegistryABI,
      functionName: "nonces",
      args: [user_wallet_address as `0x${string}`],
    });

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

  try {
    const requestJson = await c.req.json();
    console.log("📥 Received request JSON:", requestJson);

    let data;
    try {
      data = await parseWebhookEvent(requestJson, verifyAppKeyWithNeynar);
    } catch (e: unknown) {
      const error = e as ParseWebhookEvent.ErrorType;

      switch (error.name) {
        case "VerifyJsonFarcasterSignature.InvalidDataError":
        case "VerifyJsonFarcasterSignature.InvalidEventDataError":
          // The request data is invalid
          return c.json(
            { success: false, error: error.message },
            { status: 400 }
          );
        case "VerifyJsonFarcasterSignature.InvalidAppKeyError":
          // The app key is invalid
          return c.json(
            { success: false, error: error.message },
            { status: 401 }
          );
        case "VerifyJsonFarcasterSignature.VerifyAppKeyError":
          // Internal error verifying the app key (caller may want to try again)
          return c.json(
            { success: false, error: error.message },
            { status: 500 }
          );
      }
    }

    const fid = data.fid;
    const event = data.event;

    switch (event.event) {
      case "frame_added":
        if (event.notificationDetails) {
          await setUserNotificationDetails(fid, event.notificationDetails);
          await sendFrameNotification({
            fid,
            title: "Welcome to Anky!",
            body: "You'll receive daily reminders to write your Anky. Stay tuned!",
          });
        } else {
          await deleteUserNotificationDetails(fid);
        }
        break;

      case "frame_removed":
        await deleteUserNotificationDetails(fid);
        break;

      case "notifications_enabled":
        await setUserNotificationDetails(fid, event.notificationDetails);
        await sendFrameNotification({
          fid,
          title: "Welcome to Anky!",
          body: "You'll receive daily reminders to write your Anky. Stay tuned!",
        });
        break;

      case "notifications_disabled":
        await deleteUserNotificationDetails(fid);
        break;
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("💥 Error processing webhook:", error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
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

app.get("/amigo-secreto", async (c) => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          
          body {
            font-family: Arial, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
            padding: 1rem;
          }
          
          .container {
            background: white;
            padding: 1.5rem;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            text-align: center;
            width: 100%;
            max-width: 400px;
          }
          
          p {
            font-size: 1rem;
            line-height: 1.4;
            margin-bottom: 1rem;
          }
          
          input {
            width: 100%;
            padding: 0.8rem;
            margin: 0.5rem 0;
            border: 2px solid #4ecdc4;
            border-radius: 4px;
            font-size: 1rem;
            transition: transform 0.2s;
          }
          
          input:focus {
            outline: none;
            transform: scale(1.01);
          }
          
          button {
            width: 100%;
            background: #4ecdc4;
            color: white;
            border: none;
            padding: 0.8rem;
            border-radius: 4px;
            cursor: pointer;
            font-size: 1rem;
            transition: all 0.2s;
            margin-top: 0.5rem;
          }
          
          button:active {
            transform: scale(0.98);
          }
          
          @media (hover: hover) {
            button:hover {
              background: #45b7af;
            }
          }
          
          .success-message {
            color: #4ecdc4;
            margin-top: 1rem;
            display: none;
            font-size: 0.9rem;
          }
          
          @media (min-width: 768px) {
            .container {
              padding: 2rem;
            }
            
            p {
              font-size: 1.1rem;
            }
            
            input, button {
              font-size: 1.1rem;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <p>Por favor ingresa tu nombre de quien te toco:</p>
          <input type="text" id="nombreInput" placeholder="nombre de tu amig@ secret@">
          <button onclick="enviarNombre()">Enviar</button>
          <p id="successMessage" class="success-message">¡Nombre guardado exitosamente!</p>
        </div>

        <script>
          async function enviarNombre() {
            const nombre = document.getElementById('nombreInput').value;
            if (!nombre.trim()) {
              alert('Por favor ingresa un nombre');
              return;
            }

            try {
              const response = await fetch('/amigo-secreto', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ nombre }),
              });

              const data = await response.json();
              if (data.success) {
                document.getElementById('successMessage').style.display = 'block';
                document.getElementById('nombreInput').value = '';
                setTimeout(() => {
                  document.getElementById('successMessage').style.display = 'none';
                }, 3000);
              }
            } catch (error) {
              console.error('Error:', error);
              alert('Hubo un error al guardar el nombre');
            }
          }
        </script>
      </body>
    </html>
  `;

  return c.html(html);
});

app.post("/amigo-secreto", async (c) => {
  try {
    const body = await c.req.json();
    const { nombre } = body;

    if (!nombre) {
      return c.json({
        success: false,
        message: "no pusiste ningun nombre",
      });
    }

    const dir = "./data";
    const filePath = `${dir}/amigo_secreto.txt`;

    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Read existing content
    let lines: string[] = [];
    if (fs.existsSync(filePath)) {
      lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
    }

    // Insert new name at random position
    const randomIndex = Math.floor(Math.random() * (lines.length + 1));
    lines.splice(randomIndex, 0, nombre);

    // Write back to file
    fs.writeFileSync(filePath, lines.join("\n") + "\n");

    return c.json({
      success: true,
      message: "nombre guardado exitosamente, avisale al chocapec",
    });
  } catch (error) {
    console.error("Error saving name:", error);
    return c.json(
      {
        success: false,
        message: "Error al guardar el nombre",
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

app.get("/get-anky-feed", async (c) => {
  const feed = await getAnkyFeed();
  return c.json(feed);
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
