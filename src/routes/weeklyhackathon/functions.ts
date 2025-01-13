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
registerFont("./src/routes/weeklyhackathon/assets/MEKSans-Regular.otf", {
  family: "MEKSans",
  weight: "normal",
  style: "normal",
});

registerFont("./src/routes/weeklyhackathon/assets/MEKSans-Italic.otf", {
  family: "MEKSans",
  style: "italic",
  weight: "bold",
});

registerFont("./src/routes/weeklyhackathon/assets/IBMPlexMono-Regular.ttf", {
  family: "IBM Plex Mono",
});

export async function preparePassport(fid: number, address: string) {
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
      mainBgPath: "./src/routes/weeklyhackathon/assets/main-bg.svg",
      pfpFramePath: "./src/routes/weeklyhackathon/assets/pfp-frame.svg",
    });
    // call the smart contract to update the passport with the image hash
    // return passport;
    console.log("the image hash is", imageHash);
    return {
      image_url: `https://anky.mypinata.cloud/ipfs/${imageHash}`,
      smart_contract_calldata: {
        fid: user.fid,
        address: address,
        image_url: `https://anky.mypinata.cloud/ipfs/${imageHash}`,
      },
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
  console.log("Starting createFramedImageWithMask with params:", {
    username,
    fid,
    hackerNumber,
    pfpUrl,
    outputPath,
    mainBgPath,
    pfpFramePath,
  });
  try {
    // Read the SVG frame to use as a mask
    console.log("Reading SVG frame from:", pfpFramePath);
    const svgFrame = await fs.readFile(pfpFramePath, "utf-8");
    console.log("Successfully read SVG frame");

    // Create a resized version of the SVG mask
    console.log("Resizing SVG mask to 900x900");
    const resizedMask = await sharp(Buffer.from(svgFrame))
      .resize(900, 900)
      .ensureAlpha()
      .toBuffer();
    console.log("Successfully resized mask");

    // Download the profile picture from URL
    console.log("Downloading profile picture from:", pfpUrl);
    const response = await fetch(pfpUrl);
    const pfpBuffer = await response.arrayBuffer();
    console.log("Successfully downloaded profile picture");

    // Create the base image with transparency handling
    console.log("Creating base image with transparency");
    const baseImage = await sharp(Buffer.from(pfpBuffer))
      .resize(900, 900, {
        fit: "cover",
        position: "center",
      })
      .ensureAlpha()
      .toBuffer();
    console.log("Successfully created base image");

    // Composite the mask over the image
    console.log("Compositing mask over image");
    await sharp(baseImage)
      .composite([
        {
          input: resizedMask,
          blend: "over",
        },
      ])
      .toFile("output-masked.png");
    console.log("Successfully composited mask");

    // Read the main background SVG
    console.log("Reading main background from:", mainBgPath);
    const mainBgSvg = await fs.readFile(mainBgPath, "utf-8");
    console.log("Successfully read main background");

    // Create canvas for text rendering
    console.log("Creating canvas for text rendering");
    const canvas = createCanvas(1800, 2045);
    const ctx = canvas.getContext("2d");

    // Clear canvas to transparent
    console.log("Clearing canvas");
    ctx.clearRect(0, 0, 1800, 2045);

    // Draw HACKER number
    console.log("Drawing HACKER number:", hackerNumber);
    ctx.fillStyle = "#2cff05";
    ctx.font = 'italic bold 88px "MEKSans" serif';
    const hackerText = `HACKER #${hackerNumber}`;
    const hackerWidth = ctx.measureText(hackerText).width;
    ctx.fillText(hackerText, (1800 - hackerWidth) / 2, 666);

    // Draw FID (large number)
    console.log("Drawing FID:", fid);
    ctx.fillStyle = "white";
    ctx.font = "480px MEKSans";
    const fidText = fid;
    const fidWidth = ctx.measureText(fidText).width;
    ctx.fillText(fidText, (1800 - fidWidth) / 2, 1720);

    // Draw domain at bottom
    console.log("Drawing domain for username:", username);
    ctx.fillStyle = "black";
    ctx.font = "74px IBM Plex Mono";
    const domainText = `${username}.weeklyhackathon.com`;
    const domainWidth = ctx.measureText(domainText).width;
    ctx.fillText(domainText, (1800 - domainWidth) / 2, 1966);

    // Convert canvas to buffer for sharp
    console.log("Converting canvas to buffer");
    const textBuffer = await sharp(canvas.toBuffer()).ensureAlpha().toBuffer();
    console.log("Successfully converted canvas to buffer");

    // Get dimensions of main background
    console.log("Getting main background dimensions");
    const mainBgImage = await sharp(Buffer.from(mainBgSvg))
      .ensureAlpha()
      .toBuffer();

    const mainBgMetadata = await sharp(mainBgImage).metadata();
    console.log("Main background dimensions:", mainBgMetadata);

    if (!mainBgMetadata.width || !mainBgMetadata.height) {
      throw new Error("Could not get main background image dimensions");
    }

    // Read the masked output
    console.log("Reading and resizing masked output");
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
    console.log("Successfully resized masked output");

    // Calculate center position
    console.log("Calculating center position");
    const centerX = Math.round(
      (mainBgMetadata.width - mainBgMetadata.width * 0.33) / 2
    );
    const centerY = Math.round(
      ((mainBgMetadata.height - mainBgMetadata.height * 0.33) * 1.5) / 3
    );
    console.log("Center position:", { centerX, centerY });

    // Final composition
    console.log("Creating final composition");
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
    console.log("Uploading image to Pinata");
    const imageHash = await uploadImageToPinata(outputPath);
    console.log("Successfully uploaded image to IPFS with hash:", imageHash);
    return imageHash;
  } catch (error) {
    console.error("Error in createFramedImageWithMask:", error);
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
