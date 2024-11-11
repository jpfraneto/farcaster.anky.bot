import { NeynarAPIClient } from "@neynar/nodejs-sdk";
import { Logger } from "../../../utils/Logger";
import axios from "axios";

const client = new NeynarAPIClient(process.env.NEYNAR_API_KEY as string);

export async function getUserBalance(fid: number) {
  const getUsersMainAddress = await getUserMainAddress(fid);
  console.log("fetching the balance of user ", fid);
  return { eth: 0.001, usd: 200 };
}

export async function getUserMainAddress(fid: number) {}

export async function isUserFollowedByUser(fid: number, deployerFid: number) {
  try {
    const letters = "0123456789ABCDEF";
    const randomColor =
      "#" +
      letters[Math.floor(Math.random() * 16)] +
      letters[Math.floor(Math.random() * 16)] +
      letters[Math.floor(Math.random() * 16)] +
      letters[Math.floor(Math.random() * 16)] +
      letters[Math.floor(Math.random() * 16)] +
      letters[Math.floor(Math.random() * 16)];

    Logger.info(`Checking if user ${deployerFid} is followed by user ${fid}`);

    const options = {
      method: "GET",
      url: `https://api.neynar.com/v2/farcaster/user/bulk?fids=${deployerFid}&viewer_fid=${fid}`,
      headers: {
        accept: "application/json",
        "x-neynar-experimental": "true",
        "x-api-key": process.env.NEYNAR_API_KEY as string,
      },
    };

    const response = await axios.request(options);
    const user = response.data.users[0];
    const isFollowed = user.viewer_context.following;

    Logger.info(
      `User ${deployerFid} ${
        isFollowed ? "is" : "is not"
      } followed by user ${fid}`,
      { color: randomColor }
    );
    return isFollowed;
  } catch (error) {
    const errorColors = ["#FF0000", "#FF4500", "#8B0000"]; // Different shades of red
    const randomErrorColor =
      errorColors[Math.floor(Math.random() * errorColors.length)];

    Logger.error(
      `Error checking if user ${deployerFid} is followed by ${fid}: ${error}`,
      { color: randomErrorColor }
    );
    return false;
  }
}

function getRandomColor() {
  const letters = "0123456789ABCDEF";
  let color = "#";
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}
