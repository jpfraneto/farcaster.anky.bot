import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { Frog } from "frog";
import { Logger } from "../../../utils/Logger";
import fs from "fs";
import { Cast } from "../../types/farcaster";
import axios from "axios";
import farbarter_abi from "./farbarter_abi.json";
import { uploadMetadataToPinata } from "../../../utils/pinata";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, decodeEventLog } from "viem";
import { http } from "viem";
import { createWalletClient } from "viem";
import { degen } from "viem/chains";

const publicClient = createPublicClient({
  chain: degen,
  transport: http(),
});

const farbarterWalletClient = createWalletClient({
  chain: degen,
  transport: http(),
});

const FARBARTER_CONTRACT_ADDRESS = "0x8D59e8Ef33FB819979Ad09Fb444A26792970fb6f";

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

export const farbarterFrame = new Frog({
  title: "farbarter",
  imageOptions,
  imageAspectRatio: "1:1",
});

farbarterFrame.use(async (c, next) => {
  Logger.info(`[${c.req.method}] : : :  ${c.req.url}`);
  c.res.headers.set("Cache-Control", "max-age=0");
  await next();
});

farbarterFrame.get("/", (c) => {
  console.log("farbarter");
  return c.html(
    `<h1>farbarter</h1><p>This is a test</p><a href="/daimo/process-payment">Process Payment</a>`
  );
});

// Process payment route - for buyers to pay with any token
farbarterFrame.post("/process-payment", async (c) => {
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
farbarterFrame.post("/create-sale", async (c) => {
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

farbarterFrame.get("/farbarter", (c) => {
  return c.html(fs.readFileSync("./public/static/farbarter.html", "utf8"));
});

async function extractProductInfoFromCast(cast: Cast) {
  console.log("🤖 Analyzing cast content with AI...");

  try {
    // Extract image if present in embeds
    const imageUrl = cast.embeds[0]?.url;
    console.log("🖼️ Product image URL:", imageUrl);

    // Get location from author profile if available
    const location = cast.author?.profile?.location?.address?.city
      ? `${cast.author.profile.location.address.city}, ${cast.author.profile.location.address.country}`
      : "Location not specified";
    console.log("📍 Seller location:", location);

    // Call AI to extract product details and generate response
    const aiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "chatgpt-4o-latest",
          messages: [
            {
              role: "system",
              content: `You are a helpful AI assistant specialized in extracting product listing details from Farcaster casts and generating engaging responses. All prices must be in USDC.

Please analyze the following cast text and extract product information. The seller ${
                imageUrl ? "has" : "has not"
              } provided a product image.

Extract and format the following details:
1. Product name (required, use descriptive default if unclear)
2. Description (required, summarize cast content if not explicit)
3. Price in USDC (required, must be a positive number. If not specified, default to "Contact seller")
4. Whether this is a digital/online product (required, infer from context)
5. Condition (required, default to "Not specified")
6. Shipping details (required, default to "Contact seller for shipping details")
7. Category (required, infer from product details)
8. Payment method - it can be any token on any chain. this system is powered by daimo pay which allows for smooth and frictionless ux for paying with any token on any chain.
9. Seller notes (optional, any additional important details)
10. Supply (optional, default to 1)

Return TWO json objects in this format:
{
  "productInfo": {
    "name": string,
    "description": string,
    "price": number | "Contact seller",
    "isOnline": boolean,
    "condition": string,
    "shipping": string,
    "category": string,
    "paymentMethod": "USDC on Base",
    "sellerNotes": string,
    "supply": number
  },
  "castResponse": {
    "text": string // An engaging 2-3 sentence response announcing the listing
  }
}

For the castResponse, create an engaging but professional announcement that:
- Starts with "🛍️ New listing:"
- Includes product name and key details
- Always specifies price in USDC
- Mentions payment is in USDC on Base
- Includes a call to action
- Ends with relevant emoji

Example: "🛍️ New listing: Brand new iPhone 15 Pro in Miami! Asking 999 USDC, includes original packaging and accessories. Payment in USDC on Base. Click below to purchase or make an offer! 📱"

If price is not explicitly stated, encourage the user to include price in USDC in their listing.`,
            },
            {
              role: "user",
              content: cast.text,
            },
          ],
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
      }
    );
    console.log("OpenAI API Response:", aiResponse);

    if (!aiResponse.ok) {
      const errorData = await aiResponse.json();
      console.error("OpenAI API Error:", errorData);
      throw new Error(
        `OpenAI API error: ${errorData.error?.message || "Unknown error"}`
      );
    }

    const aiData = await aiResponse.json();
    if (!aiData.choices?.[0]?.message?.content) {
      throw new Error("Invalid AI response format");
    }

    if (!aiData.choices?.[0]?.message?.content) {
      throw new Error("Invalid AI response format");
    }
    const productInfo = JSON.parse(aiData.choices[0].message.content);

    console.log("🎯 AI extracted product info:", productInfo);

    // Validate required fields
    if (
      !productInfo.productInfo?.name ||
      !productInfo.productInfo?.description ||
      !productInfo.productInfo?.price
    ) {
      throw new Error("Missing required product information in cast");
    }

    return {
      name: `@${cast.author.username} - ${productInfo.productInfo.name}`,
      description: productInfo.productInfo.description,
      price: productInfo.productInfo.price,
      imageUrl,
      location,
      isOnline: productInfo.productInfo.isOnline || false,
      sellerAddress: cast.author.custody_address,
      supply: productInfo.productInfo.supply || 1,
    };
  } catch (error) {
    console.error("🚨 Error extracting product info:", error);
    throw error;
  }
}

farbarterFrame.post("/farbarter-webhook", async (c) => {
  try {
    console.log("📨 Received farbarter webhook");
    const webhookData = await c.req.json();

    // Verify this is a cast creation event
    if (webhookData.type !== "cast.created") {
      console.log("⏭️ Ignoring non-cast event");
      return c.json({ success: false, message: "Not a cast event" });
    }

    if (
      !webhookData.data.mentioned_profiles?.some(
        (profile: any) => profile.fid === 935866
      )
    ) {
      console.log("⏭️ farbarterbot not mentioned in cast");
      return c.json({ success: false, message: "farbarterbot not mentioned" });
    }

    // Extract product info from cast
    console.log("🔍 Extracting product info from cast...", webhookData);
    const productInfo = await extractProductInfoFromCast(webhookData.data);
    console.log("🎯 AI extracted product info:", productInfo);
    // Generate unique ID for this listing
    const idempotencyKey = crypto.randomUUID();
    console.log("🔑 Generated idempotency key:", idempotencyKey);

    // create listing in smart contract
    const metadata = {
      fid: webhookData.data.author.fid,
      price: productInfo.price,
      supply: productInfo.supply,
      name: productInfo.name,
      description: productInfo.description,
      imageUrl: productInfo.imageUrl,
      location: productInfo.location,
      isOnline: productInfo.isOnline,
      castHash: webhookData.data.hash,
    };

    // upload metadata to ipfs
    const metadataIpfsHash = await uploadMetadataToPinata(metadata);
    console.log("🔗 Metadata IPFS hash:", metadataIpfsHash);

    // create listing in smart contract

    const account = privateKeyToAccount(
      process.env.PRIVATE_KEY as `0x${string}`
    );
    console.log("📝 Writing contract for new listing");
    const usdcAmount = (parseFloat(productInfo.price) * 1_000_000).toString();

    const transaction_hash = await farbarterWalletClient.writeContract({
      account,
      address: FARBARTER_CONTRACT_ADDRESS,
      abi: farbarter_abi,
      functionName: "createListing",
      args: [
        webhookData.data.author.fid,
        usdcAmount,
        productInfo.supply,
        metadataIpfsHash,
        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
        8453, // Base
      ],
    });

    console.log("💫 Transaction hash received:", transaction_hash);

    console.log("⏳ Waiting for transaction receipt");
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: transaction_hash,
    });

    const listingCreatedLog = receipt.logs.find((log) => {
      try {
        const decodedLog = decodeEventLog({
          abi: farbarter_abi,
          data: log.data,
          topics: log.topics,
        });
        return decodedLog.eventName === "ListingCreated";
      } catch {
        return false;
      }
    });

    if (!listingCreatedLog) {
      console.log("❌ listingCreatedLog event not found");
      throw new Error("listingCreatedLog event not found in transaction logs");
    }

    const decodedLog = decodeEventLog({
      abi: farbarter_abi,
      data: listingCreatedLog.data,
      topics: listingCreatedLog.topics,
      eventName: "ListingCreated",
    });

    const listingId = Number(decodedLog?.args?.listingId); // Convert BigInt to Number
    console.log("🆔 listingId:", listingId);

    console.log("UNTIL HERE WE SHOULD BE GOOD. THE TOKEN SHOULD BE CREATED");

    // Create the payment link via Daimo
    // console.log("💸 Creating Daimo payment link...");
    // const response = await fetch("https://pay.daimo.com/api/generate", {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //     "Idempotency-Key": idempotencyKey,
    //     "Api-Key": "pay-demo",
    //   },
    //   body: JSON.stringify({
    //     intent: "farbarter",
    //     items: [
    //       {
    //         name: productInfo.name,
    //         description: productInfo.description,
    //         image: productInfo.imageUrl,
    //       },
    //     ],
    //     recipient: {
    //       address: productInfo.sellerAddress,
    //       amount: usdcAmount.toString(),
    //       token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
    //       chain: 8453,
    //     },
    //     redirectUri: "https://farcaster.anky.bot/daimo/farbarter",
    //   }),
    // });

    // const daimoData = await response.json();
    // console.log("✨ Daimo payment link created:", daimoData.url);

    const options = {
      method: "POST",
      url: "https://api.neynar.com/v2/farcaster/cast",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": process.env.NEYNAR_API_KEY,
      },
      data: {
        text: `🎉 Successfully created farbarter listing:\n\n"${productInfo.name}"\n\n$${productInfo.price} USDC\nlisting id: ${listingId}.\n\nThe buyer pays with any token on any chain.\n\nThe seller will receive the USDC in their custody address.\n\nIf you are interested on this listing, open the frame below.`,
        signer_uuid: process.env.FARBARTERBOT_SIGNER_UUID,
        parent: webhookData.data.hash,
        idem: idempotencyKey,
        embeds: [
          {
            url: `https://farbarter.com/listing/${listingId}`,
          },
        ],
      },
    };

    const response2 = await axios.request(options);
    const cast_hash = response2.data.cast.hash;
    console.log("farbarterbot replied on this cast hash", cast_hash);

    return c.json({
      success: true,
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

interface Listing {
  name: string;
  description: string;
  image: string;
  location: string;
  isOnline: boolean;
  castHash: string;
  price: number;
  supply: number;
}

farbarterFrame.get("/generate-payment-link/:listingId", async (c) => {
  console.log(
    "🎯 Generating payment link for listing:",
    c.req.param("listingId")
  );
  const listingId = c.req.param("listingId");

  try {
    console.log("📖 Fetching listing details from contract...");
    const listing = (await publicClient.readContract({
      address: FARBARTER_CONTRACT_ADDRESS,
      abi: farbarter_abi,
      functionName: "getListingDetails",
      args: [listingId],
    })) as [
      string,
      bigint,
      bigint,
      bigint,
      string,
      boolean,
      bigint,
      string,
      bigint
    ];

    console.log("✅ Listing details fetched:", listing);

    const [
      sellerAddress,
      fid,
      price,
      remainingSupply,
      metadata,
      isActive,
      createdAt,
      preferredToken,
      preferredChain,
    ] = listing;

    const listingMetadata = (await axios.get(
      `https://anky.mypinata.cloud/ipfs/${metadata}`
    )) as Listing;

    const isAvailable = remainingSupply > 0n && isActive;
    console.log("🔍 Checking if listing is available:", isAvailable);
    if (!isAvailable) {
      console.log("❌ Listing is not available");
      return c.json(
        {
          success: false,
          error: "This listing is no longer available",
        },
        400
      );
    }

    console.log("🔑 Generating idempotency key...");
    const idempotencyKey = crypto.randomUUID();
    console.log("✨ Generated idempotency key:", idempotencyKey);

    console.log("🌐 Making request to Daimo API...");
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
            name: listingMetadata.name,
            description: listingMetadata.description,
            image: listingMetadata.image,
          },
        ],
        recipient: {
          address: sellerAddress,
          amount: price.toString(),
          token: preferredToken,
          chain: Number(preferredChain),
        },
        redirectUri: "https://farcaster.anky.bot/daimo/farbarter",
      }),
    });

    console.log("📥 Parsing Daimo response...");
    const daimoData = await response.json();
    console.log("✅ Daimo payment link generated:", daimoData);

    console.log("🎉 Successfully generated payment link");
    return c.json({
      success: true,
      paymentUrl: daimoData.url,
      paymentId: daimoData.id,
      listing: {
        sellerAddress,
        fid,
        price,
        remainingSupply,
        metadata: listingMetadata,
        isActive,
        createdAt,
        preferredToken,
        preferredChain,
      },
    });
  } catch (error) {
    console.error("💥 Error generating payment link:", error);
    return c.json(
      {
        success: false,
        error: "Failed to generate payment link",
      },
      500
    );
  }
});

// FUNCTIONS
