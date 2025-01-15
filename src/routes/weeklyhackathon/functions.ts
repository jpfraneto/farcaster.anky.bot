import sharp from "sharp";
import { createCanvas, loadImage, registerFont } from "canvas";
import axios from "axios";
import fs from "fs/promises";
import { getUserByFid } from "../../../utils/farcaster";
import FormData from "form-data";
import { createWriteStream } from "fs";

var data = new FormData();
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

export async function preparePassport(
  fid: number,
  address: string,
  reservedTokenId: bigint
) {
  try {
    const user = await getUserByFid(fid);
    console.log("the user is", user);
    if (!user) {
      throw new Error("User not found");
    }

    const imageHash = await createFramedImageWithMask({
      username: user.username.endsWith(".eth")
        ? user.username.slice(0, -4)
        : user.username,
      fid: user.fid.toString(),
      hackerNumber: reservedTokenId.toString(),
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
      fid: user.fid,
      address: address,
      username: user.username,
    };
  } catch (error) {
    console.error("Error preparing passport");
    throw error;
  }
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

function isImgurUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes("imgur.com");
  } catch (error) {
    return false;
  }
}

async function downloadImgurImage(url: string): Promise<string> {
  const tempPath = "./temp-imgur-image.jpg";

  try {
    console.log("Starting image download from imgur...", url);

    const commonUserAgents = [
      {
        ua: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.3",
        pct: 48.62,
      },
      {
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Mobile/15E148 Safari/604.",
        pct: 16.57,
      },
      {
        ua: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.3",
        pct: 9.94,
      },
      {
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/346.1.704810410 Mobile/15E148 Safari/604.",
        pct: 4.97,
      },
      {
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.",
        pct: 3.31,
      },
      {
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.134 Mobile/15E148 Safari/604.",
        pct: 2.76,
      },
      {
        ua: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 OPR/86.0.0.",
        pct: 2.21,
      },
      {
        ua: "Mozilla/5.0 (Linux; Android 11; moto e20 Build/RONS31.267-94-14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.135 Mobile Safari/537.3",
        pct: 1.66,
      },
      {
        ua: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.3",
        pct: 1.1,
      },
      {
        ua: "Mozilla/5.0 (Android 13; Mobile; rv:133.0) Gecko/133.0 Firefox/133.",
        pct: 1.1,
      },
      {
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0.1 Mobile/15E148 Safari/604.",
        pct: 0.55,
      },
      {
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.",
        pct: 0.55,
      },
      {
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.",
        pct: 0.55,
      },
      {
        ua: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.3",
        pct: 0.55,
      },
      {
        ua: "Mozilla/5.0 (Linux; arm_64; Android 15; 24030PN60G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.98 YaBrowser/24.12.1.98.00 SA/3 Mobile Safari/537.3",
        pct: 0.55,
      },
      {
        ua: "Mozilla/5.0 (Linux; Android 7.0; SM-G930V Build/NRD90M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.125 Mobile Safari/537.36 (compatible; Google-Read-Aloud; +https://support.google.com/webmasters/answer/1061943",
        pct: 0.55,
      },
      {
        ua: "Mozilla/5.0 (Linux; Android 13; M2103K19G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Mobile Safari/537.3",
        pct: 0.55,
      },
      {
        ua: "Mozilla/5.0 (Linux; Android 12; 220733SG Build/SP1A.210812.016) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.135 Mobile Safari/537.3",
        pct: 0.55,
      },
      {
        ua: "Mozilla/5.0 (Linux; Android 11; moto e20 Build/RONS31.267-94-14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.105 Mobile Safari/537.3",
        pct: 0.55,
      },
      {
        ua: "Mozilla/5.0 (Linux; Android 10; SAMSUNG SM-G980F) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/22.0 Chrome/111.0.5563.116 Mobile Safari/537.3",
        pct: 0.55,
      },
      {
        ua: "Mozilla/5.0 (Linux; Android 10; NEN-LX1 Build/HUAWEINEN-LX1; wv) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.105 Mobile Safari/537.36 HuaweiBrowser/15.0.4.312 HMSCore/6.14.0.32",
        pct: 0.55,
      },
      {
        ua: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.3",
        pct: 0.55,
      },
      {
        ua: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.3",
        pct: 0.55,
      },
      {
        ua: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.3",
        pct: 0.55,
      },
    ];
    const randomUserAgent =
      commonUserAgents[Math.floor(Math.random() * commonUserAgents.length)];
    const response = await axios({
      method: "get",
      url: url,
      headers: {
        "User-Agent": randomUserAgent.ua,
      },
    });

    console.log("Got response from imgur");
    console.log("Content type:", response.headers["content-type"]);
    console.log("Content length:", response.headers["content-length"]);

    const writer = createWriteStream(tempPath);

    response.data.pipe(writer);

    await new Promise<void>((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    console.log("Successfully downloaded imgur image");
    return tempPath;
  } catch (error) {
    console.error("Error downloading imgur image");
    throw error;
  }
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

    // Handle image download
    let pfpBuffer: Buffer;

    if (isImgurUrl(pfpUrl)) {
      console.log("Detected imgur URL, using special handling");
      const tempImagePath = await downloadImgurImage(pfpUrl);
      pfpBuffer = await fs.readFile(tempImagePath);
      // Clean up temp file
      await fs.unlink(tempImagePath).catch(console.error);
    } else {
      // Handle non-imgur URLs normally
      console.log("Downloading profile picture from:", pfpUrl);
      const response = await fetch(pfpUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch image: ${response.status} ${response.statusText}`
        );
      }
      pfpBuffer = Buffer.from(await response.arrayBuffer());
    }

    console.log("Profile picture buffer length:", pfpBuffer.length);
    if (pfpBuffer.length === 0) {
      throw new Error("Downloaded profile picture buffer is empty");
    }

    // Create the base image with transparency
    console.log("Creating base image with transparency");
    const baseImage = await sharp(pfpBuffer)
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
    ctx.fillText(fidText, (1800 - fidWidth) / 2, 1745);

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
    console.error("Error in createFramedImageWithMask:");
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
