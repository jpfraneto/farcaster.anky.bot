import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { Frog } from "frog";
import { Logger } from "../../../utils/Logger";
import fs from "fs";
import { Cast } from "../../types/farcaster";
import axios from "axios";

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
    const { amount, idempotencyKey } = body;
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
        intent: "farbarter",
        items: [
          {
            name: "hello world",
            description: "this is the description of the item",
            image:
              "https://pbs.twimg.com/profile_images/1874309036629192704/Dc1U8dbr_400x400.jpg",
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
    const { amount, idempotencyKey } = body;
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
            name: "hello world",
            description: "this is the description of the item",
            image:
              "https://pbs.twimg.com/profile_images/1874309036629192704/Dc1U8dbr_400x400.jpg",
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

async function extractProductInfoFromCast(cast: Cast) {
  console.log("🤖 Analyzing cast content with AI...");

  try {
    // Extract image if present in embeds
    const imageUrl = cast.embeds.find((e: any) => e.type === "image")?.url;
    console.log("the image url is", imageUrl);
    // Get location from author profile if available
    const location = cast.author?.location || "Unknown";
    // Call AI to extract product details from cast text
    console.log("the locations is", location);
    const aiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4",
          messages: [
            {
              role: "system",
              content: `You are a helpful AI assistant specialized in extracting product listing details from Farcaster casts. 
              
Please analyze the following cast text and extract:
- Product name
- Description 
- Price in USD (numeric value only)
- Whether this is a digital/online product (true/false)
- Condition (new, used, etc)
- Shipping details if provided
- Any other relevant product metadata

Return the information in this JSON format:
{
  "name": "string",
  "description": "string", 
  "price": number,
  "isOnline": boolean,
  "condition": "string",
  "shipping": "string",
  "metadata": {}
}

Be precise and only include information that is explicitly stated in the cast.`,
            },
            {
              role: "user",
              content: cast.text,
            },
          ],
          temperature: 0.1,
          response_format: "json_object",
        }),
      }
    );

    const aiData = await aiResponse.json();
    if (!aiData.choices?.[0]?.message?.content) {
      throw new Error("Invalid AI response format");
    }
    const productInfo = JSON.parse(aiData.choices[0].message.content);

    console.log("🎯 AI extracted product info:", productInfo);

    // Validate required fields
    if (!productInfo.name || !productInfo.description || !productInfo.price) {
      throw new Error("Missing required product information in cast");
    }

    return {
      name: productInfo.name,
      description: productInfo.description,
      price: productInfo.price,
      imageUrl,
      location,
      isOnline: productInfo.isOnline || false,
      sellerAddress: cast.author.custody_address,
    };
  } catch (error) {
    console.error("🚨 Error extracting product info:", error);
    throw error;
  }
}

daimoFrame.post("/farbarter-webhook", async (c) => {
  try {
    console.log("📨 Received farbarter webhook");
    const webhookData = await c.req.json();

    // Verify this is a cast creation event
    if (webhookData.type !== "cast.created") {
      console.log("⏭️ Ignoring non-cast event");
      return c.json({ success: false, message: "Not a cast event" });
    }

    // Extract product info from cast
    console.log("🔍 Extracting product info from cast...", webhookData);
    const productInfo = await extractProductInfoFromCast(webhookData.data);
    console.log("🎯 AI extracted product info:", productInfo);
    // Generate unique ID for this listing
    const idempotencyKey = crypto.randomUUID();
    console.log("🔑 Generated idempotency key:", idempotencyKey);

    // Create the payment link via Daimo
    console.log("💸 Creating Daimo payment link...");
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
            name: productInfo.name,
            description: productInfo.description,
            image: productInfo.imageUrl,
          },
        ],
        recipient: {
          address: productInfo.sellerAddress,
          amount: productInfo.price.toString(),
          token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
          chain: 8453,
        },
        redirectUri: "https://farcaster.anky.bot/daimo/farbarter",
      }),
    });

    const daimoData = await response.json();
    console.log("✨ Daimo payment link created:", daimoData.url);

    // TODO: Call smart contract to store listing
    console.log("📝 Preparing to store listing in smart contract...");
    // const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
    // await contract.createListing(
    //   productInfo.name,
    //   productInfo.description,
    //   productInfo.imageUrl,
    //   productInfo.price,
    //   productInfo.location,
    //   productInfo.isOnline,
    //   daimoData.id
    // );

    console.log("🎉 Successfully created farbarter listing:", {
      name: productInfo.name,
      price: productInfo.price,
      paymentId: daimoData.id,
    });

    const options = {
      method: "POST",
      url: "https://api.neynar.com/v2/farcaster/cast",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": process.env.NEYNAR_API_KEY,
      },
      data: {
        text: `🎉 Successfully created farbarter listing: ${productInfo.name} for ${productInfo.price}`,
        signer_uuid: process.env.ANKY_SIGNER_UUID,
        parent: webhookData.data.hash,
        idem: idempotencyKey,
        embeds: [
          {
            url: daimoData.url,
          },
        ],
      },
    };
    console.log("options", options);

    const response2 = await axios.request(options);
    const cast_hash = response2.data.cast.hash;
    console.log("anky replied on this cast hash", cast_hash);

    return c.json({
      success: true,
      paymentLink: daimoData.url,
      paymentId: daimoData.id,
    });
  } catch (error) {
    console.error("💥 Error processing farbarter webhook:", error);
    return c.json(
      {
        success: false,
        message: "Error processing farbarter webhook",
      },
      500
    );
  }
});
