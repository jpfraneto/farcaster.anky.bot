import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { Frog } from "frog";
import { Logger } from "../../../utils/Logger";
import fs from "fs";

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

export const daimoFrame = new Frog({
  title: "farbarter",
  imageOptions,
  imageAspectRatio: "1:1",
});

daimoFrame.use(async (c, next) => {
  Logger.info(`[${c.req.method}] : : :  ${c.req.url}`);
  c.res.headers.set("Cache-Control", "max-age=0");
  await next();
});

daimoFrame.get("/", (c) => {
  console.log("farbarter");
  return c.html(
    `<h1>farbarter</h1><p>This is a test</p><a href="/daimo/process-payment">Process Payment</a>`
  );
});

// Process payment route - for buyers to pay with any token
daimoFrame.post("/process-payment", async (c) => {
  console.log("🚀 Starting payment processing...");
  try {
    const body = await c.req.json();
    const { amount, idempotencyKey, image_url, name, description } = body;
    console.log("💰 Payment amount:", amount);
    console.log("🔑 Idempotency key:", idempotencyKey);

    console.log("🌐 Calling Daimo API...");
    const response = await fetch("https://pay.daimo.com/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "Api-Key": process.env.DAIMO_API_KEY || "pay-demo",
      },
      body: JSON.stringify({
        intent: "Pagar via Puente",
        items: [
          {
            name: name,
            description: description,
            image: image_url,
          },
        ],
        recipient: {
          address: "0x8a3022e14b88af73F7e97a34C5227e8eb3e870B0",
          amount: amount,
          token: "0x4ed4e862860bed51a9570b96d89af5e1b0efefed",
          chain: 8453,
        },
        redirectUri: "https://framesgiving.anky.bot/farbarter",
        paymentOptions: ["Coinbase", "RampNetwork", "Binance"],
      }),
    });

    const data = await response.json();
    console.log("✅ Payment processed successfully:", data);
    return c.json(data);
  } catch (error) {
    console.error("💥 Error processing payment:", error);
    return c.json(
      {
        success: false,
        message: "Error processing payment",
      },
      500
    );
  }
});

// Create sale route - for sellers to generate payment links
daimoFrame.post("/create-sale", async (c) => {
  console.log("🏪 Starting sale creation...");
  try {
    const body = await c.req.json();
    const { amount, idempotencyKey, image_url, name, description } = body;
    console.log("💰 Sale amount:", amount);
    console.log("🔑 Idempotency key:", idempotencyKey);

    const usdcAmount = (parseFloat(amount) * 1_000_000).toString();
    console.log("💵 USDC amount (with 6 decimals):", usdcAmount);

    console.log("🌐 Calling Daimo API to generate payment link...");
    const response = await fetch("https://pay.daimo.com/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "Api-Key": "pay-demo",
      },
      body: JSON.stringify({
        intent: "farbarter",
        items: [
          {
            name: name,
            description: description,
            image: image_url,
          },
        ],
        recipient: {
          address: "0xed21735DC192dC4eeAFd71b4Dc023bC53fE4DF15",
          amount: usdcAmount.toString(),
          token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          chain: 8453,
        },
        redirectUri: "https://farcaster.anky.bot/daimo/farbarter",
      }),
    });

    const data = await response.json();
    console.log("the data that comes back is", data);
    return c.json({
      success: true,
      paymentLink: data.url,
      paymentId: data.id,
    });
  } catch (error) {
    console.error("💥 Error creating sale:", error);
    return c.json(
      {
        success: false,
        message: "Error creating sale",
      },
      500
    );
  }
});

daimoFrame.get("/farbarter", (c) => {
  return c.html(fs.readFileSync("./public/static/farbarter.html", "utf8"));
});
