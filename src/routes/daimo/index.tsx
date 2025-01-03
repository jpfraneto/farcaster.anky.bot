import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";

const app = new Hono();

// Process payment route - for buyers to pay with any token
app.post("/process-payment", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      return c.json({ error: "No authorization token provided" }, 401);
    }

    const body = await c.req.json();
    const { amount, idempotencyKey } = body;

    // Call Daimo API to get payment status
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
    return c.json(data);
  } catch (error) {
    console.error("Error processing payment:", error);
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
app.post("/create-sale", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      return c.json({ error: "No authorization token provided" }, 401);
    }

    const body = await c.req.json();
    const { amount, transactionId } = body;

    // Convert amount to USDC units (6 decimals)
    const usdcAmount = (parseFloat(amount) * 1_000_000).toString();

    // Generate Daimo payment link
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
    return c.json({
      success: true,
      paymentLink: data.url,
      paymentId: data.id,
    });
  } catch (error) {
    console.error("Error creating sale:", error);
    return c.json(
      {
        success: false,
        message: "Error creating sale",
      },
      500
    );
  }
});

export default app;
