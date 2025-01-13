import { PinataSDK } from "pinata-web3";
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";
dotenv.config();
import fs from "fs";
import path from "path";
import os from "os";
import axios from "axios";
import { getAnkyBioFromSimplePrompt } from "./anky";
import { retryWithExponentialBackoff } from ".";

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

      const fetchMetadataWithTimeout = async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        try {
          const metadata = await pinata.gateways.get(
            `bafybeibawzhxy5iu4jtinkldgczwt43jsufah36m4zl5b7zykfsj5sx3uu/${random_anky}`
          );
          clearTimeout(timeout);
          return metadata;
        } catch (error: any) {
          clearTimeout(timeout);
          if (error.name === "AbortError") {
          }
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

        const response = await axios.request(options);
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
      retryCount++;
      if (retryCount === maxRetries) {
        return null; // Return null instead of throwing to prevent server crash
      }

      const delayMs = Math.pow(2, retryCount) * 1000;

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return null; // Return null if all retries fail
}
export async function getAnkyBio(anky: any) {
  try {
    const anky_bio_prompt = `From the mystical depths of the Ankyverse emerges ${anky.name}. Within their unique story lies this sacred lore: <AnkyLore>${anky.description}</AnkyLore>. Channel the essence of this Anky's journey into an enchanting bio under 222 characters - one that reveals the magic, wisdom and transformative power they hold for those who encounter them. Avoid using self referencing language. Just imagine you are this character, and you write your bio for a social media profile. Be humble. Be fun. And avoid too much spiritual jargon.`;
    const response = await getAnkyBioFromSimplePrompt(anky_bio_prompt);
    // Extract just the bio string from the response object and remove quotes
    const cleanBio = response.replace(/^"|"$/g, "");
    return cleanBio;
  } catch (error) {
    console.error("Error getting anky bio:", error);
    return "anky is you";
  }
}

export async function downloadRandomAnkys(count: number = 66) {
  console.log("Starting downloadRandomAnkys function");
  const downloadedIndexes = new Set();
  const outputDir = path.join(process.cwd(), "data", "ankys");

  // Create directories if they don't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (let downloaded = 0; downloaded < count; ) {
    try {
      // Generate random index between 0-8887
      const random_anky = Math.floor(Math.random() * 8888);

      // Skip if we've already downloaded this index
      if (downloadedIndexes.has(random_anky)) {
        continue;
      }

      // Fetch metadata from Pinata
      const metadata = await pinata.gateways.get(
        `bafybeibawzhxy5iu4jtinkldgczwt43jsufah36m4zl5b7zykfsj5sx3uu/${random_anky}`
      );

      if (!metadata?.data) {
        console.log(`No metadata for anky #${random_anky}, skipping...`);
        continue;
      }

      let current_anky = metadata.data;
      if (typeof current_anky === "string") {
        current_anky = JSON.parse(current_anky);
      }

      // Get anky bio
      const anky_bio = await getAnkyBio(current_anky);

      // Format attributes as single line
      const attributes = (current_anky as any).attributes
        .map((attr: any) => `${attr.trait_type}:${attr.value}`)
        .join(",");

      // Create content for text file
      const fileContent = `${
        (current_anky as any).name
      }\n${anky_bio}\n${attributes}`;

      // Write to file
      const filePath = path.join(outputDir, `${downloaded}.txt`);
      fs.writeFileSync(filePath, fileContent);

      // Download image
      const imageResponse = await pinata.gateways.get(
        (current_anky as any).image
      );
      if (imageResponse?.data) {
        const imageBuffer = Buffer.from(
          await (imageResponse.data as Blob).arrayBuffer()
        );
        const imagePath = path.join(outputDir, `${downloaded}.png`);
        fs.writeFileSync(imagePath, imageBuffer);
      }

      downloadedIndexes.add(random_anky);
      downloaded++;

      console.log(
        `Successfully downloaded anky #${random_anky} (${downloaded}/${count})`
      );

      // Add small delay between downloads
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error("Error downloading anky:", error);
      // Continue to next iteration on error
      continue;
    }
  }

  console.log(`Successfully downloaded ${count} random ankys to ${outputDir}`);
}

export async function uploadTXTsessionToScrollHub(
  session_long_string: string
): Promise<string | null> {
  const user_id = session_long_string.split("\n")[0];
  const session_id = session_long_string.split("\n")[1];
  const prompt = session_long_string.split("\n")[2];
  const starting_timestamp = session_long_string.split("\n")[3];
  const options = {
    method: "POST",
    url: `https://scroll.anky.bot/writeFile.htm?folderName=scroll.anky.bot&fileName=${session_id}.txt`,
    headers: {
      "Content-Type": "text/plain",
      "x-api-key": process.env.SCROLLHUB_API_KEY,
    },
    data: { content: session_long_string },
  };
  const response = await axios.request(options);
  return response.data;
}

export async function uploadTXTsessionToPinata(
  session_long_string: string
): Promise<string | null> {
  try {
    const parsedSession = session_long_string.split("\n");
    const user_id = parsedSession[0];
    const session_id = parsedSession[1];

    console.log(
      `Uploading session for user ${user_id} with session ID ${session_id}`
    );

    const pinataResponse = await retryWithExponentialBackoff(async () => {
      return await pinata.upload.file(
        new File([session_long_string], `${session_id}.txt`, {
          type: "text/plain",
        })
      );
    });

    console.log(
      "Successfully uploaded to Pinata with hash:",
      pinataResponse.IpfsHash
    );
    return pinataResponse.IpfsHash;
  } catch (error) {
    console.error(
      "Error uploading session to Pinata after all retries:",
      error
    );
    return null;
  }
}

export async function uploadMetadataToPinata(
  metadata: any
): Promise<string | null> {
  try {
    console.log("Uploading metadata to Pinata...");

    const pinataResponse = await retryWithExponentialBackoff(async () => {
      return await pinata.upload.json(metadata);
    });

    console.log(
      "Successfully uploaded metadata to Pinata with hash:",
      pinataResponse.IpfsHash
    );
    return pinataResponse.IpfsHash;
  } catch (error) {
    console.error(
      "Error uploading metadata to Pinata after all retries:",
      error
    );
    return null;
  }
}

export async function uploadImageToPinata(
  imagePath: string
): Promise<string | null> {
  const pinataResponse = await pinata.upload.file(
    new File([imagePath], "image.png", { type: "image/png" })
  );
  return pinataResponse.IpfsHash;
}
