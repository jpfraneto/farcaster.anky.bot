import { Hono } from "hono";
import fs from "fs";
import axios from "axios";
import FormData from "form-data";

import {
  OPENAI_API_KEY,
  PINATA_API_JWT,
  PINATA_API_KEY,
  PINATA_API_SECRET,
} from "../../../env/server-env";
import { OpenAI, toFile } from "openai";
export const onchainacidRoute = new Hono();

onchainacidRoute.post("/process-image", async (c) => {
  console.log("🖼️ Image processing endpoint hit");
  try {
    // Access OPENAI_API_KEY from environment
    if (!OPENAI_API_KEY) {
      console.error("❌ OpenAI API key not found in environment variables");
      return c.json({ error: "Server configuration error" }, 500);
    }

    if (!PINATA_API_JWT) {
      console.error("❌ Pinata API JWT not found in environment variables");
      return c.json({ error: "Server configuration error" }, 500);
    }

    // Initialize OpenAI client with API key from environment
    const openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });
    console.log("🤖 OpenAI client initialized");

    // Get image data from request body
    console.log("📦 Extracting request body");
    const { image } = await c.req.json();

    if (!image) {
      console.log("❌ No image provided in request");
      return c.json({ error: "No image provided" }, 400);
    }

    // Extract base64 data from the data URL
    console.log("🔄 Extracting base64 data from image");
    const base64Data = image.split(",")[1];

    // Convert base64 to buffer
    console.log("📊 Converting base64 to buffer");
    const imageBuffer = Buffer.from(base64Data, "base64");

    console.log("📤 Sending image to OpenAI API...");

    // Create a file object from the buffer
    console.log("📄 Creating file object from buffer");
    const file = await toFile(imageBuffer, "input.png", { type: "image/png" });

    // Send to OpenAI API
    console.log("🔮 Calling OpenAI image edit API");
    try {
      const response = await openai.images.edit({
        model: "gpt-image-1",
        image: file,
        prompt: `
          Convert the supplied artwork into a single LSD blotter sheet. 
          Center the original drawing exactly as-is. Surround it with a realistic 
          10 × 10 micro-perforated cotton paper grid—subtle deckle edges, tiny 
          cross-cut perforations, faint shadows between squares. Warm recycled-tan 
          carrier sheet showing around the perforated square. Paper texture: 
          slightly fibrous, matte, softly lit. Colors stay true to the source art, 
          ink looks absorbed into the paper. Hyper-real, crisp 1024×1024 render.
        `,
        n: 1,
        size: "1024x1024",
      });
      console.log("✨ Received response from OpenAI");

      const image_base64 = response?.data?.[0]?.b64_json;
      if (!image_base64) {
        throw new Error("No image data received from OpenAI");
      }
      const image_bytes = Buffer.from(image_base64, "base64");
      const randomFileName = crypto.randomUUID();
      const filePath = `${randomFileName}.png`;
      fs.writeFileSync(filePath, image_bytes);

      // Upload to Pinata IPFS
      console.log("🔄 Uploading image to Pinata IPFS");

      // Create form data for Pinata upload
      const formData = new FormData();
      formData.append("file", fs.createReadStream(filePath), {
        filename: `blotterfi-${randomFileName}.png`,
        contentType: "image/png",
      });

      // Optional metadata
      const metadata = JSON.stringify({
        name: `BlotterFi Art ${randomFileName}`,
        keyvalues: {
          service: "blotterfi",
          type: "acid-art",
        },
      });
      formData.append("pinataMetadata", metadata);

      // Upload options
      const pinataOptions = JSON.stringify({
        cidVersion: 1,
      });
      formData.append("pinataOptions", pinataOptions);

      // Make request to Pinata API
      const pinataResponse = await axios.post(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        formData,
        {
          maxBodyLength: Infinity,
          headers: {
            Authorization: `Bearer ${PINATA_API_JWT}`,
            ...formData.getHeaders(),
          },
        }
      );

      console.log("✅ Image uploaded to Pinata IPFS");

      // Get IPFS hash (CID) and gateway URL
      const ipfsCid = pinataResponse.data.IpfsHash;
      const ipfsUrl = `https://anky.mypinata.cloud/ipfs/${ipfsCid}`;

      console.log("IPFS CID:", ipfsCid);
      console.log("IPFS Gateway URL:", ipfsUrl);

      // Clean up temporary file
      fs.unlinkSync(filePath);

      // Return the processed image
      console.log("🎉 Returning processed image to client");
      return c.json({
        success: true,
        image: ipfsUrl,
        ipfsCid: ipfsCid,
      });
    } catch (apiError) {
      console.error("❌ OpenAI API Error:", apiError);
      console.error("Error details:", JSON.stringify(apiError, null, 2));
      throw apiError;
    }
  } catch (error) {
    console.error("❌ Error processing image:", error);
    return c.json(
      {
        error: "Failed to process image",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});
