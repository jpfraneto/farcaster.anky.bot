import sharp from "sharp";
import { createCanvas, loadImage, registerFont } from "canvas";
import axios from "axios";
import fs from "fs/promises";
import { getUserByFid } from "../../../utils/farcaster";
import {
  uploadImageToPinata,
  uploadMetadataToPinata,
} from "../../../utils/pinata";

// Register custom fonts
registerFont("./MEKSans-Regular.otf", {
  family: "MEKSans",
  weight: "normal",
  style: "normal",
});

registerFont("./MEKSans-Italic.otf", {
  family: "MEKSans",
  style: "italic",
  weight: "bold",
});

registerFont("./IBMPlexMono-Regular.ttf", {
  family: "IBM Plex Mono",
});

export async function preparePassport(fid: number) {
  try {
    const user = await getUserByFid(fid);
    console.log("the user is", user);
    if (!user) {
      throw new Error("User not found");
    }
    const hacker_number = await gethackerNumber(fid);
    const imageHash = await createFramedImageWithMask({
      username: user.username,
      fid: user.fid.toString(),
      hackerNumber: hacker_number.toString(),
      pfpUrl: user.pfp_url,
      outputPath: `./${user.fid}.png`,
      mainBgPath: "./assets/main-bg.svg",
      pfpFramePath: "./assets/pfp-frame.svg",
    });
    // call the smart contract to update the passport with the image hash
    // return passport;
    return {
      image_url: `https://anky.mypinata.cloud/ipfs/${imageHash}`,
      smart_contract_calldata: "0x1234567890",
    };
  } catch (error) {
    console.error("Error preparing passport:", error);
    throw error;
  }
}

async function gethackerNumber(fid: number) {
  // call the smart contract to get the hacker number
  return 888888;
}

interface CreateFramedImageWithMaskProps {
  username?: string;
  fid?: string;
  hackerNumber?: string;
  pfpUrl?: string;
  outputPath?: string;
  mainBgPath?: string;
  pfpFramePath?: string;
}

export async function createFramedImageWithMask({
  username = "verylongusername",
  fid = "1043832",
  hackerNumber = "12",
  pfpUrl = "1.jpeg",
  outputPath = "final-output.png",
  mainBgPath = "./main-bg.svg",
  pfpFramePath = "./pfp-frame.svg",
}: CreateFramedImageWithMaskProps) {
  try {
    // Read the SVG frame to use as a mask
    const svgFrame = await fs.readFile(pfpFramePath, "utf-8");

    // Create a resized version of the SVG mask
    const resizedMask = await sharp(Buffer.from(svgFrame))
      .resize(900, 900)
      .ensureAlpha()
      .toBuffer();

    // Download the profile picture from URL
    const response = await fetch(pfpUrl);
    const pfpBuffer = await response.arrayBuffer();

    // Create the base image with transparency handling
    const baseImage = await sharp(Buffer.from(pfpBuffer))
      .resize(900, 900, {
        fit: "cover",
        position: "center",
      })
      .ensureAlpha()
      .toBuffer();

    // Composite the mask over the image
    await sharp(baseImage)
      .composite([
        {
          input: resizedMask,
          blend: "over",
        },
      ])
      .toFile("output-masked.png");

    // Read the main background SVG
    const mainBgSvg = await fs.readFile(mainBgPath, "utf-8");

    // Create canvas for text rendering
    const canvas = createCanvas(1800, 2045);
    const ctx = canvas.getContext("2d");

    // Clear canvas to transparent
    ctx.clearRect(0, 0, 1800, 2045);

    // Draw HACKER number
    ctx.fillStyle = "#2cff05";
    ctx.font = 'italic bold 88px "MEKSans" serif';
    const hackerText = `HACKER #${hackerNumber}`;
    const hackerWidth = ctx.measureText(hackerText).width;
    ctx.fillText(hackerText, (1800 - hackerWidth) / 2, 666);

    // Draw FID (large number)
    ctx.fillStyle = "white";
    ctx.font = "480px MEKSans";
    const fidText = fid;
    const fidWidth = ctx.measureText(fidText).width;
    ctx.fillText(fidText, (1800 - fidWidth) / 2, 1720);

    // Draw domain at bottom
    ctx.fillStyle = "black";
    ctx.font = "74px IBM Plex Mono";
    const domainText = `${username}.weeklyhackathon.com`;
    const domainWidth = ctx.measureText(domainText).width;
    ctx.fillText(domainText, (1800 - domainWidth) / 2, 1966);

    // Convert canvas to buffer for sharp
    const textBuffer = await sharp(canvas.toBuffer()).ensureAlpha().toBuffer();

    // Get dimensions of main background
    const mainBgImage = await sharp(Buffer.from(mainBgSvg))
      .ensureAlpha()
      .toBuffer();

    const mainBgMetadata = await sharp(mainBgImage).metadata();

    if (!mainBgMetadata.width || !mainBgMetadata.height) {
      throw new Error("Could not get main background image dimensions");
    }

    // Read the masked output
    const maskedOutput = await sharp("output-masked.png")
      .resize(
        Math.round(mainBgMetadata.width * 0.33),
        Math.round(mainBgMetadata.height * 0.33),
        {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        }
      )
      .toBuffer();

    // Calculate center position
    const centerX = Math.round(
      (mainBgMetadata.width - mainBgMetadata.width * 0.33) / 2
    );
    const centerY = Math.round(
      ((mainBgMetadata.height - mainBgMetadata.height * 0.33) * 1.5) / 3
    );

    // Final composition
    await sharp(mainBgImage)
      .composite([
        {
          input: maskedOutput,
          top: centerY,
          left: centerX,
          blend: "over",
        },
        {
          input: textBuffer,
          blend: "over",
        },
      ])
      .toFile(outputPath);

    console.log(`Successfully created image at: ${outputPath}`);
    // Upload image to Pinata
    const imageHash = await uploadImageToPinata(outputPath);
    console.log("Successfully uploaded image to IPFS with hash:", imageHash);
    return imageHash;
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}

export async function generateHackathonCards() {
  try {
    const fids = [16098, 2, 293723, 888888];

    const options = {
      method: "GET",
      url: `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fids.join(
        ","
      )}`,
      headers: {
        accept: "application/json",
        "x-neynar-experimental": "false",
        "x-api-key": process.env.NEYNAR_API_KEY,
      },
    };

    const response = await axios.request(options);
    const users = response.data.users;

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      await createFramedImageWithMask({
        username: user.username,
        fid: user.fid.toString(),
        hackerNumber: (i + 1).toString(),
        pfpUrl: user.pfp_url,
        outputPath: `./${user.fid}.png`,
        mainBgPath: "./main-bg.svg",
        pfpFramePath: "./pfp-frame.svg",
      });
    }
  } catch (error) {
    console.error("Error generating hackathon cards:", error);
    throw error;
  }
}
