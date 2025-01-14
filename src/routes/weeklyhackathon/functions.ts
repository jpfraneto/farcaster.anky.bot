import sharp from "sharp";
import { createCanvas, loadImage, registerFont } from "canvas";
import axios from "axios";
import fs from "fs/promises";
import { getUserByFid } from "../../../utils/farcaster";
import path from "path";

const ASSETS_DIR = path.join(
  process.cwd(),
  "src/routes/weeklyhackathon/assets"
);

try {
  registerFont(path.join(ASSETS_DIR, "MEKSans-Regular.otf"), {
    family: "MEKSans",
    weight: "normal",
    style: "normal",
  });

  registerFont(path.join(ASSETS_DIR, "MEKSans-Italic.otf"), {
    family: "MEKSans",
    style: "italic",
    weight: "bold",
  });

  registerFont(path.join(ASSETS_DIR, "IBMPlexMono-Regular.ttf"), {
    family: "IBM Plex Mono",
  });
} catch (error) {
  console.warn("Failed to register fonts:", error);
  // Continue execution - fallback fonts will be used
}

export async function preparePassport(
  fid: number,
  address: string,
  reservedTokenId: bigint
) {
  try {
    const user = await getUserByFid(fid);
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

    return {
      image_url: `https://anky.mypinata.cloud/ipfs/${imageHash}`,
      fid: user.fid,
      address: address,
      username: user.username,
    };
  } catch (error) {
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

export async function createFramedImageWithMask({
  username = "verylongusername",
  fid = "1043832",
  hackerNumber = "12",
  pfpUrl = "1.jpeg",
  outputPath = "final-output.png",
  mainBgPath = path.join(ASSETS_DIR, "main-bg.svg"),
  pfpFramePath = path.join(ASSETS_DIR, "pfp-frame.svg"),
}: CreateFramedImageWithMaskProps) {
  try {
    const svgFrame = await fs.readFile(pfpFramePath, "utf-8");

    const resizedMask = await sharp(Buffer.from(svgFrame))
      .resize(900, 900)
      .ensureAlpha()
      .toBuffer();

    const response = await fetch(pfpUrl);
    const pfpBuffer = await response.arrayBuffer();

    const baseImage = await sharp(Buffer.from(pfpBuffer))
      .resize(900, 900, {
        fit: "cover",
        position: "center",
      })
      .ensureAlpha()
      .toBuffer();

    await sharp(baseImage).composite([
      {
        input: resizedMask,
        blend: "over",
      },
    ]);

    const mainBgSvg = await fs.readFile(mainBgPath, "utf-8");

    const canvas = createCanvas(1800, 2045);
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, 1800, 2045);

    ctx.fillStyle = "#2cff05";
    ctx.font = 'italic bold 88px "MEKSans" serif';
    const hackerText = `HACKER #${hackerNumber}`;
    const hackerWidth = ctx.measureText(hackerText).width;
    ctx.fillText(hackerText, (1800 - hackerWidth) / 2, 666);

    ctx.fillStyle = "white";
    ctx.font = "480px MEKSans";
    const fidText = fid;
    const fidWidth = ctx.measureText(fidText).width;
    ctx.fillText(fidText, (1800 - fidWidth) / 2, 1745);

    ctx.fillStyle = "black";
    ctx.font = "74px IBM Plex Mono";
    const domainText = `${username}.weeklyhackathon.com`;
    const domainWidth = ctx.measureText(domainText).width;
    ctx.fillText(domainText, (1800 - domainWidth) / 2, 1966);

    const textBuffer = await sharp(canvas.toBuffer()).ensureAlpha().toBuffer();

    const mainBgImage = await sharp(Buffer.from(mainBgSvg))
      .ensureAlpha()
      .toBuffer();

    const mainBgMetadata = await sharp(mainBgImage).metadata();

    if (!mainBgMetadata.width || !mainBgMetadata.height) {
      throw new Error("Could not get main background image dimensions");
    }

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

    const centerX = Math.round(
      (mainBgMetadata.width - mainBgMetadata.width * 0.33) / 2
    );
    const centerY = Math.round(
      ((mainBgMetadata.height - mainBgMetadata.height * 0.33) * 1.5) / 3
    );

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

    await fs.copyFile(
      outputPath,
      `./public/images/${outputPath.split("/").pop()}`
    );
  } catch (error) {
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
        "x-api-key": "4DF21FD5-FB60-426C-9521-FA2106A7E969",
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
    throw error;
  }
}

generateHackathonCards();
