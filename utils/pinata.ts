import { PinataSDK } from "pinata-web3";
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";
dotenv.config();
import fs from "fs";
import path from "path";
import os from "os";
import axios from "axios";
import { getAnkyBioFromSimplePrompt } from "./anky";

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT,
  pinataGateway: process.env.PINATA_GATEWAY_URL,
  pinataGatewayKey: process.env.PINATA_GATEWAY_KEY,
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export async function pinataMainTest() {
  const maxRetries = 5;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      // Fetch metadata from Pinata with timeout
      console.log("Fetching metadata from Pinata...");
      const random_anky = Math.floor(Math.random() * 8888);
      console.log("random_anky", random_anky);

      const fetchMetadataWithTimeout = async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 16180);

        try {
          const metadata = await pinata.gateways.get(
            `bafybeibawzhxy5iu4jtinkldgczwt43jsufah36m4zl5b7zykfsj5sx3uu/${random_anky}`
          );
          clearTimeout(timeout);
          return metadata;
        } catch (error: any) {
          clearTimeout(timeout);
          if (error.name === "AbortError") {
            throw new Error("Request timeout");
          }
          throw error;
        }
      };

      let metadata;
      try {
        metadata = await fetchMetadataWithTimeout();
      } catch (error: any) {
        if (error?.message === "Request timeout") {
          console.log("Request timed out, trying another anky number...");
          continue;
        }
        throw error;
      }

      console.log("THE METADATA IS", metadata);
      let this_anky_kingdom = "void";
      console.log("metadata", metadata);
      if (metadata?.data && typeof metadata.data === "object") {
        const parsedData = metadata.data as {
          attributes?: Array<{ trait_type: string; value: string }>;
        };
        const kingdomAttribute = parsedData.attributes?.find(
          (attr) => attr.trait_type === "Kingdom"
        );
        this_anky_kingdom = kingdomAttribute?.value.toLowerCase() || "void";
        console.log("Anky Kingdom:", this_anky_kingdom);
      }
      const current_anky = metadata.data;

      // Extract image URL from metadata
      let imageUrl;
      if (typeof metadata?.data === "string") {
        const jsonData = JSON.parse(metadata.data);
        imageUrl = jsonData.image;
      } else if (
        metadata?.data &&
        typeof metadata.data === "object" &&
        "image" in metadata.data
      ) {
        imageUrl = (metadata.data as { image: string }).image;
      } else {
        throw new Error("Could not find image URL in metadata");
      }

      // Fetch image from Pinata
      console.log("Fetching image from Pinata...");
      const imageResponse = await pinata.gateways.get(imageUrl);
      if (!imageResponse.data) {
        throw new Error("No image data received");
      }
      console.log("Image response:", imageResponse);

      // Create temp file path
      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, `temp-${Date.now()}.png`);

      // Convert Blob to Buffer before writing
      const arrayBuffer = await (imageResponse.data as Blob).arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Write buffer to temp file
      fs.writeFileSync(tempFilePath, buffer);
      console.log("Image saved to:", tempFilePath);

      // Upload to Cloudinary
      console.log("Uploading to Cloudinary...");
      const cloudinaryResponse = await cloudinary.uploader.upload(
        tempFilePath,
        {
          folder: "anky",
          public_id: "anky_eth_pfp", // Fixed public_id ensures same URL
          overwrite: true, // Allow overwriting existing image
          unique_filename: false, // Prevent adding random string to filename
          use_filename: false, // Don't use original filename
          preset: "anky_mobile",
        }
      );

      console.log(
        "Successfully uploaded to Cloudinary:",
        cloudinaryResponse.secure_url
      );
      const new_anky_bio = await getAnkyBio(current_anky);
      console.log("new_anky_bio", new_anky_bio);
      const options = {
        method: "PATCH",
        url: "https://api.neynar.com/v2/farcaster/user",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-api-key": process.env.NEYNAR_API_KEY,
        },
        data: {
          location: { latitude: -41.321732, longitude: -72.986343 },
          signer_uuid: process.env.ANKY_SIGNER_UUID,
          bio: new_anky_bio,
          pfp_url: cloudinaryResponse.secure_url,
          display_name:
            `${(
              current_anky as { name: string }
            )?.name.toLowerCase()} · ${this_anky_kingdom}` || "Anky Eres Tu",
        },
      };
      console.log("SENDING TO NEYNAR", options);

      await axios
        .request(options)
        .then((res) =>
          console.log("Successfully updated Farcaster profile:", res.data)
        )
        .catch((err) =>
          console.error("Error updating Farcaster profile:", err)
        );

      // Clean up temp file
      fs.unlinkSync(tempFilePath);
      console.log("Cleaned up temporary file");

      return cloudinaryResponse.secure_url;
    } catch (error) {
      console.error("Error in pinataMainTest:", error);
      retryCount++;
      if (retryCount === maxRetries) {
        console.error(
          "Final error in pinataMainTest after all retries:",
          error
        );
        throw error;
      }

      const delayMs = Math.pow(2, retryCount) * 1000; // Exponential backoff: 2s, 4s, 8s, 16s, 32s
      console.log(
        `Retry ${retryCount}/${maxRetries} after ${delayMs / 1000}s delay`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export async function getAnkyBio(anky: any) {
  console.log("Starting getAnkyBio function for anky:", anky.name);
  try {
    const anky_bio_prompt = `From the mystical depths of the Ankyverse emerges ${anky.name}. Within their unique story lies this sacred lore: <AnkyLore>${anky.description}</AnkyLore>. Channel the essence of this Anky's journey into an enchanting bio under 222 characters - one that reveals the magic, wisdom and transformative power they hold for those who encounter them. Avoid using self referencing language. Just imagine you are this character, and you write your bio for a social media profile. Be humble. Be fun. And avoid too much spiritual jargon.`;
    console.log("Generated bio prompt:", anky_bio_prompt);
    const this_anky_bio = await getAnkyBioFromSimplePrompt(anky_bio_prompt);
    console.log("Received bio from prompt:", this_anky_bio);
    return this_anky_bio;
  } catch (error) {
    console.error("Error getting anky bio:", error);
    return "anky is you";
  }
}
