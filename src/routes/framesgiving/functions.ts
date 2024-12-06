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

export async function isUserFollowedByUser(deployerFid: number, fid: number) {
  try {
    if (!deployerFid || !fid) {
      return false;
    }
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

    // Extract the first user from the users array in the response
    const user = response.data.users[0];

    // Check viewer_context.following to see if viewer_fid follows this user
    const isFollowed = user?.viewer_context?.following ?? false;

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

export function uuidToBytes32(uuid: string) {
  // Remove dashes and '0x' if present
  const cleanUuid = uuid.replace(/-/g, "").replace("0x", "");

  // Pad with zeros to make it 32 bytes
  const padded = cleanUuid.padEnd(64, "0");

  return "0x" + padded;
}

export function extractSessionDataFromLongString(session_long_string: string): {
  user_id: string;
  session_id: string;
  prompt: string;
  starting_timestamp: number;
  session_text: string;
  total_time_written: number;
  word_count: number;
  average_wpm: number;
} {
  console.log("Extracting session data from long string:", session_long_string);

  const lines = session_long_string.split("\n");
  const user_id = lines[0];
  const session_id = lines[1];
  const prompt = lines[2];
  const starting_timestamp = parseInt(lines[3]);

  console.log("Initial data:", {
    user_id,
    session_id,
    prompt,
    starting_timestamp,
  });

  // Process typing data starting from line 4
  let session_text = "";
  let total_time = 0;
  let total_chars = 0;
  for (let i = 4; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const [char, timeStr] = lines[i].split(/\s+/);
    const time = parseFloat(timeStr);

    console.log(`Processing character at line ${i}:`, { char, time });

    // Handle backspace
    if (char === "Backspace") {
      session_text = session_text.slice(0, -1);
      console.log("Backspace pressed, new text:", session_text);
    }
    // Handle special characters
    else if (char === "Space" || char === "") {
      session_text += " ";
      console.log("Space pressed, new text:", session_text);
    } else if (char === "Enter") {
      session_text += "\n";
      console.log("Enter pressed, new text:", session_text);
    }
    // Handle regular characters
    else if (char.length === 1) {
      session_text += char;
      console.log("Character added, new text:", session_text);
    }
    total_chars += 1;
    total_time += time;
    console.log("Running total time:", total_time);
  }

  // Filter out multiple consecutive spaces and trim
  session_text = session_text.replace(/\s+/g, " ").trim();

  const word_count = session_text
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
  console.log("the word count is ", word_count);

  // Calculate average time between keystrokes in milliseconds
  const avgKeystrokeTime = total_time / total_chars;
  console.log("the avgKeystrokeTime is", avgKeystrokeTime);

  // Calculate how many keystrokes can be made in a minute
  const keystrokesPerMinute = 60 / avgKeystrokeTime;
  console.log("the keystrokes per minute is ", keystrokesPerMinute);

  // Assuming average word length of 5 characters plus a space (6 keystrokes per word)
  const average_wpm = Number((keystrokesPerMinute / 6).toFixed(2));
  console.log("the average wpm is ", average_wpm);
  // Add 8 seconds (8000ms) as per requirement

  console.log("the total time written is ", Math.floor(total_time + 8));

  const result = {
    user_id,
    session_id,
    prompt,
    starting_timestamp,
    session_text,
    total_time_written: 1000 * Math.floor(total_time + 8),
    word_count,
    average_wpm,
  };

  console.log("Final extracted session data:", result);
  return result;
}
