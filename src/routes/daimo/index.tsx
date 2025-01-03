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
  title: "KuyKuy",
  imageOptions,
  imageAspectRatio: "1:1",
});

daimoFrame.use(async (c, next) => {
  Logger.info(`[${c.req.method}] : : :  ${c.req.url}`);
  c.res.headers.set("Cache-Control", "max-age=0");
  await next();
});

daimoFrame.get("/", (c) => {
  console.log("KuyKuy");
  return c.html(
    `<h1>KuyKuy</h1><p>This is a test</p><a href="/daimo/process-payment">Process Payment</a>`
  );
});

// Process payment route - for buyers to pay with any token
daimoFrame.post("/process-payment", async (c) => {
  console.log("🚀 Starting payment processing...");
  try {
    const body = await c.req.json();
    const { amount, idempotencyKey } = body;
    console.log("💰 Payment amount:", amount);
    console.log("🔑 Idempotency key:", idempotencyKey);

    // Call Daimo API to get payment status
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
            name: `8 usdc a anky`,
            description: "subscripcion mensual",
          },
        ],
        recipient: {
          address: "0x8a3022e14b88af73F7e97a34C5227e8eb3e870B0", // KuyKuy's Base address
          amount: amount,
          token: "0x4ed4e862860bed51a9570b96d89af5e1b0efefed", // USDC on Base
          chain: 8453, // Base chain ID
        },
        redirectUri: "https://framesgiving.anky.bot/kuykuy",
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

daimoFrame.get("/kuykuy", (c) => {
  return c.html(fs.readFileSync("./public/static/kuykuy.html", "utf8"));
});

// Create sale route - for sellers to generate payment links
daimoFrame.post("/create-sale", async (c) => {
  console.log("🏪 Starting sale creation...");
  try {
    const body = await c.req.json();
    const { amount, transactionId } = body;
    console.log("💰 Sale amount:", amount);
    console.log("🔑 Transaction ID:", transactionId);

    // Convert amount to USDC units (6 decimals)
    const usdcAmount = (parseFloat(amount) * 1_000_000).toString();
    console.log("💵 USDC amount:", usdcAmount);

    // Generate Daimo payment link
    console.log("🔗 Generating Daimo payment link...");
    const response = await fetch("https://pay.daimo.com/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": transactionId,
        "Api-Key": process.env.DAIMO_API_KEY || "pay-demo",
      },
      body: JSON.stringify({
        intent: "Pay KuyKuy Seller",
        items: [
          {
            name: "KuyKuy Sale",
            description: `Sale ID: ${transactionId}`,
          },
        ],
        recipient: {
          address: process.env.RECIPIENT_ADDRESS, // Your Base address
          amount: usdcAmount,
          token: "0x4ed4e862860bed51a9570b96d89af5e1b0efefed", // USDC on Base
          chain: 8453, // Base chain ID
        },
        redirectUri: process.env.REDIRECT_URI,
        paymentOptions: ["Coinbase", "RampNetwork", "Binance"],
      }),
    });

    const data = await response.json();
    console.log("✅ Sale created successfully:", data);
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
