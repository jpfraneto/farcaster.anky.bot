import dotenv from "dotenv";
dotenv.config();

import { Button, Frog, TextInput } from "frog";
import { devtools } from "frog/dev";
import { serveStatic } from "frog/serve-static";
import { cors } from "hono/cors";
import axios from "axios";
import fs from "fs";
import path from "path";

// import { neynar } from 'frog/hubs'
import { clankerFrame } from "./routes/clanker";

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

app.post("/clanker-webhook", async (c) => {
  const body = await c.req.json();
  console.log("THE CLANKER WEBHOOK WAS TRIGGERED", body);

  // Check if body.data and body.data.text exist before trying to split
  if (!body.data?.text) {
    console.log("Missing required text data in webhook body");
    return c.json({
      message: "Missing required text data",
      success: false,
    });
  }

  // Check if the text contains the required URL pattern
  if (!body.data.text.includes("https://basescan.org/address/")) {
    console.log("Text does not contain required basescan URL");
    return c.json({
      message: "Invalid text format",
      success: false,
    });
  }
  if (Number(body.data.author.fid) !== 874542) {
    console.log("THE AUTHOR IS NOT CLANKER", body.data.author.fid);
    return c.json({
      message: "Not clanker",
      success: false,
    });
  }

  // Extract the token address from the text
  const tokenAddress = body.data.text
    .split("https://basescan.org/address/")[1]
    .substring(0, 42);
  console.log("THE TOKEN ADDRESS IS", tokenAddress);

  if (tokenAddress.length == 42 && body.data.parent_hash) {
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
    const deployerUsername = axiosResponse.data.cast.author.username;
    console.log("THE DEPLOYER USERNAME IS", deployerUsername);

    sendDCsToSubscribedUsers(tokenAddress, deployerUsername);
  }

  return c.json({
    message: "ok",
    success: true,
  });
});

async function sendDCsToSubscribedUsers(
  tokenAddress: string,
  deployerUsername: string
) {
  // Read the notification-fids.json file
  const notificationsFilePath = path.join(
    process.cwd(),
    "notification-fids.json"
  );

  try {
    // Check if file exists
    if (!fs.existsSync(notificationsFilePath)) {
      console.log("No subscribers found");
      return;
    }

    // Read subscribed FIDs
    const subscribedFids = JSON.parse(
      fs.readFileSync(notificationsFilePath, "utf8")
    );
    console.log("THE SUBSCRIBED FIDS ARE", subscribedFids);
    console.log("SENDING DCS TO", subscribedFids.length, "USERS");

    // Map through each FID and send notification
    await Promise.all(
      subscribedFids.map(async (fid: number) => {
        try {
          console.log(`Sending notification to FID: ${fid}`);

          await sendDC(fid, tokenAddress, deployerUsername);
        } catch (error) {
          console.error(`Error sending notification to FID ${fid}:`, error);
        }
      })
    );
  } catch (error) {
    console.error("Error processing notifications:", error);
  }
}

async function sendDC(
  fid: number,
  tokenAddress: string,
  deployerUsername: string
) {
  try {
    const uuid = crypto.randomUUID();
    const response = await axios.put(
      "https://api.warpcast.com/v2/ext-send-direct-cast",
      {
        recipientFid: fid,
        message: `NEW CLANKER TOKEN BY @${deployerUsername}\n\n*****DEXSCREENER*****https://dexscreener.com/base/${tokenAddress}\n\n*****UNISWAP*****\n\n https://app.uniswap.org/swap?chain=base&outputCurrency=${tokenAddress}`,
        idempotencyKey: uuid,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.ANKY_WARPCAST_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return true;
  } catch (error: any) {
    try {
      console.log(
        "ERROR SENDING DC",
        error.response?.data.errors || error.data.errors
      );
      return false;
    } catch (error) {
      console.log("ERROR SENDING DC", error);
      return false;
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.frame("/", (c) => {
  const { buttonValue, inputText, status } = c;
  const fruit = inputText || buttonValue;
  return c.res({
    image: (
      <div
        style={{
          alignItems: "center",
          background:
            status === "response"
              ? "linear-gradient(to right, #432889, #17101F)"
              : "black",
          backgroundSize: "100% 100%",
          display: "flex",
          flexDirection: "column",
          flexWrap: "nowrap",
          height: "100%",
          justifyContent: "center",
          textAlign: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            color: "white",
            fontSize: 60,
            fontStyle: "normal",
            letterSpacing: "-0.025em",
            lineHeight: 1.4,
            marginTop: 30,
            padding: "0 120px",
            whiteSpace: "pre-wrap",
          }}
        >
          {status === "response"
            ? `Nice choice.${fruit ? ` ${fruit.toUpperCase()}!!` : ""}`
            : "Welcome!"}
        </div>
      </div>
    ),
    intents: [
      <TextInput placeholder="Enter custom fruit..." />,
      <Button value="apples">Apples</Button>,
      <Button value="oranges">Oranges</Button>,
      <Button value="bananas">Bananas</Button>,
      status === "response" && <Button.Reset>Reset</Button.Reset>,
    ],
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
