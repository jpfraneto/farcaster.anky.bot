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
        console.error("Error fetching metadata:", error);
        throw error;
      }

      if (!metadata?.data) {
        console.log("No metadata received, trying another anky number...");
        continue;
      }

      let this_anky_kingdom = "void";
      let current_anky = metadata.data;

      try {
        if (typeof metadata.data === "string") {
          current_anky = JSON.parse(metadata.data);
        }

        if (current_anky && typeof current_anky === "object") {
          const kingdomAttribute =
            current_anky && "attributes" in current_anky
              ? (
                  current_anky.attributes as Array<{
                    trait_type: string;
                    value: string;
                  }>
                ).find((attr) => attr.trait_type === "Kingdom")
              : undefined;
          this_anky_kingdom = kingdomAttribute?.value?.toLowerCase() || "void";
        }
      } catch (error) {
        console.error("Error parsing metadata:", error);
        this_anky_kingdom = "void";
      }

      // Extract image URL from metadata
      let imageUrl;
      try {
        if (typeof current_anky === "string") {
          const jsonData = JSON.parse(current_anky);
          imageUrl = jsonData.image;
        } else if (
          current_anky &&
          typeof current_anky === "object" &&
          "image" in current_anky
        ) {
          imageUrl = current_anky.image;
        }

        if (!imageUrl) {
          console.log("No image URL found, trying another anky...");
          continue;
        }
      } catch (error) {
        console.error("Error extracting image URL:", error);
        continue;
      }

      // Fetch image from Pinata
      let imageResponse;
      try {
        console.log("Fetching image from Pinata...");
        imageResponse = await pinata.gateways.get(imageUrl);
        if (!imageResponse?.data) {
          console.log("No image data received, trying another anky...");
          continue;
        }
      } catch (error) {
        console.error("Error fetching image:", error);
        continue;
      }

      // Create temp file path and handle file operations in try/catch
      let tempFilePath;
      try {
        const tempDir = os.tmpdir();
        tempFilePath = path.join(tempDir, `temp-${Date.now()}.png`);
        const arrayBuffer = await (imageResponse.data as Blob).arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(tempFilePath, buffer);
      } catch (error) {
        console.error("Error handling temp file:", error);
        continue;
      }

      // Upload to Cloudinary
      let cloudinaryResponse;
      try {
        cloudinaryResponse = await cloudinary.uploader.upload(tempFilePath, {
          folder: "anky",
          public_id: "anky_eth_pfp",
          overwrite: true,
          unique_filename: false,
          use_filename: false,
          preset: "anky_mobile",
        });
      } catch (error) {
        console.error("Error uploading to Cloudinary:", error);
        if (tempFilePath) {
          try {
            fs.unlinkSync(tempFilePath);
          } catch (e) {
            console.error("Error cleaning up temp file:", e);
          }
        }
        continue;
      }

      // Update Farcaster profile
      try {
        const new_anky_bio = await getAnkyBio(current_anky);
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
            display_name: `${
              (current_anky as { name: string })?.name?.toLowerCase() || "anky"
            } · ${this_anky_kingdom}`,
          },
        };

        await axios.request(options);
      } catch (error) {
        console.error("Error updating Farcaster profile:", error);
      }

      // Clean up temp file
      if (tempFilePath) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch (error) {
          console.error("Error cleaning up temp file:", error);
        }
      }

      return cloudinaryResponse.secure_url;
    } catch (error) {
      console.error("Error in pinataMainTest:", error);
      retryCount++;
      if (retryCount === maxRetries) {
        console.error(
          "Final error in pinataMainTest after all retries:",
          error
        );
        return null; // Return null instead of throwing to prevent server crash
      }

      const delayMs = Math.pow(2, retryCount) * 1000;
      console.log(
        `Retry ${retryCount}/${maxRetries} after ${delayMs / 1000}s delay`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return null; // Return null if all retries fail
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
