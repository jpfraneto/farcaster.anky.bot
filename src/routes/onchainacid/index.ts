import { Hono } from "hono";
import fs from "fs";
import crypto from "crypto";
import axios from "axios";

import { OPENAI_API_KEY, UPLOADTHING_TOKEN } from "../../../env/server-env";
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

    if (!UPLOADTHING_TOKEN) {
      console.error("❌ UploadThing token not found in environment variables");
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

      // Upload to UploadThing
      console.log("🔄 Uploading image to UploadThing");

      // Parse the UploadThing token to get the app ID
      const tokenParts = UPLOADTHING_TOKEN.split("_");
      const appId = tokenParts[tokenParts.length - 1];

      // Generate a file key for UploadThing
      const fileKey = generateUploadThingFileKey(appId, randomFileName);
      const fileSize = fs.statSync(filePath).size;
      const fileName = `${randomFileName}.png`;

      // Generate presigned URL
      const presignedUrl = await generatePresignedUrl(
        fileKey,
        appId,
        fileName,
        fileSize,
        "image/png",
        UPLOADTHING_TOKEN
      );

      // Upload the file to UploadThing
      const fileStream = fs.createReadStream(filePath);
      await axios.put(presignedUrl, fileStream, {
        headers: {
          "Content-Type": "image/png",
          "Content-Length": fileSize.toString(),
        },
      });

      // Get the public URL
      const uploadThingUrl = `https://utfs.io/f/${fileKey}`;

      console.log("✅ Image uploaded to UploadThing");
      console.log("UploadThing URL:", uploadThingUrl);

      // Clean up the temporary file
      fs.unlinkSync(filePath);

      // Return the processed image
      console.log("🎉 Returning processed image to client");
      return c.json({
        success: true,
        image: uploadThingUrl,
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

// Helper function to generate UploadThing file key
function generateUploadThingFileKey(appId: string, fileSeed: string): string {
  // Simple implementation of djb2 hash function
  const djb2 = (s: string) => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
      h = (h << 5) + h + s.charCodeAt(i);
    }
    return Math.abs(h & 0xffffffff);
  };

  // Simple alphabet shuffling based on seed
  const shuffleAlphabet = (alphabet: string, seed: string) => {
    const chars = alphabet.split("");
    const seedNum = djb2(seed);
    for (let i = chars.length - 1; i > 0; i--) {
      const j = seedNum % (i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join("");
  };

  // Base64 encode the file seed to ensure it's URL safe
  const encodeBase64 = (str: string) => {
    return Buffer.from(str)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  };

  // Default alphabet for Sqids
  const defaultAlphabet =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  // Shuffle the alphabet based on appId
  const shuffledAlphabet = shuffleAlphabet(defaultAlphabet, appId);

  // Generate a 12-character encoded app ID (simplified version)
  const encodedAppId = shuffledAlphabet.substring(0, 12);

  // Encode the file seed
  const encodedFileSeed = encodeBase64(fileSeed);

  // Combine to create the file key
  return `${encodedAppId}${encodedFileSeed}`;
}

// Helper function to generate presigned URL for UploadThing
async function generatePresignedUrl(
  fileKey: string,
  appId: string,
  fileName: string,
  fileSize: number,
  fileType: string,
  apiKey: string
): Promise<string> {
  // Create HMAC SHA256 function
  const hmacSha256 = (url: URL, key: string) => {
    const hmac = crypto.createHmac("sha256", key);
    hmac.update(url.toString());
    return hmac.digest("hex");
  };

  // Create URL with search params
  const searchParams = new URLSearchParams({
    expires: (Date.now() + 60 * 60 * 1000).toString(), // 1 hour from now
    "x-ut-identifier": appId,
    "x-ut-file-name": fileName,
    "x-ut-file-size": fileSize.toString(),
    "x-ut-file-type": fileType,
  });

  // Use sea1 as the default region
  const url = new URL(`https://sea1.ingest.uploadthing.com/${fileKey}`);
  url.search = searchParams.toString();

  // Generate signature
  const signature = `hmac-sha256=${hmacSha256(url, apiKey)}`;
  url.searchParams.append("signature", signature);

  return url.toString();
}
