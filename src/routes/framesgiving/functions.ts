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

interface SessionData {
  user_id: string;
  session_id: string;
  prompt: string;
  starting_timestamp: number;
  session_text: string;
  total_time_written: number;
  word_count: number;
  average_wpm: number;
  flow_score: number;
}

export function extractSessionDataFromLongString(
  session_long_string: string
): SessionData {
  console.log("Starting to extract session data from string...");
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

  let session_text = "";
  let total_time = 0;
  let total_chars = 0;
  let intervals: number[] = [];

  console.log("Processing lines starting from index 4...");

  // Process each line starting from index 4
  for (let i = 4; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Count leading spaces to detect space inputs
    const leadingSpaces = line.match(/^\s*/)?.[0]?.length ?? 0;

    if (leadingSpaces > 0) {
      // If there are leading spaces, user typed a space
      session_text += " ";
      const timestamp = parseFloat(line.trim());
      total_time += timestamp;
      total_chars += 1;
      intervals.push(timestamp);
      console.log(`Line ${i}: Space input detected, timestamp: ${timestamp}`);
    } else {
      // Handle regular characters and special keys
      const [char, timeStr] = line.split(/\s+/);
      const time = parseFloat(timeStr);
      total_time += time;
      total_chars += 1;
      intervals.push(time);

      console.log(`Line ${i}: Character "${char}" with time ${time}`);

      if (char === "Backspace") {
        session_text = session_text.slice(0, -1);
        console.log("Backspace detected, removing last character");
      } else if (char === "Space" || char === "") {
        session_text += " ";
        console.log("Space character added");
      } else if (char === "Enter") {
        session_text += "\n";
        console.log("Newline character added");
      } else if (char.length === 1) {
        session_text += char;
        console.log(`Regular character "${char}" added`);
      }
    }
  }

  console.log("Finished processing lines. Calculating metrics...");

  // Filter out multiple consecutive spaces and trim
  session_text = session_text.replace(/\s+/g, " ").trim();

  const word_count = session_text
    .split(/\s+/)
    .filter((word) => word.length > 0).length;

  console.log("Word count:", word_count);

  // Calculate average time between keystrokes in milliseconds
  const avgKeystrokeTime = total_time / total_chars;
  console.log("Average keystroke time:", avgKeystrokeTime);

  // Calculate how many keystrokes can be made in a minute
  const keystrokesPerMinute = 60 / avgKeystrokeTime;
  console.log("Keystrokes per minute:", keystrokesPerMinute);

  // Assuming average word length of 5 characters plus a space (6 keystrokes per word)
  const average_wpm = Number((keystrokesPerMinute / 6).toFixed(2));
  console.log("Average WPM:", average_wpm);

  // Calculate variance for flow score
  const variance =
    intervals.reduce((acc, interval) => {
      const diff = interval - avgKeystrokeTime;
      return acc + diff * diff;
    }, 0) / intervals.length;

  const stdDev = Math.sqrt(variance);
  console.log("Standard deviation:", stdDev);

  // Calculate coefficient of variation (CV) = stdDev / mean
  const cv = stdDev / avgKeystrokeTime;
  console.log("Coefficient of variation:", cv);

  // Convert CV to a 0-100 score
  // Lower CV means more consistent typing (better flow)
  // Using exponential decay function to map CV to score
  const flow_score = Number((100 * Math.exp(-cv)).toFixed(2));
  console.log("Final flow score:", flow_score);

  const result = {
    user_id,
    session_id,
    prompt,
    starting_timestamp,
    session_text,
    total_time_written: 1000 * Math.floor(total_time + 8),
    word_count,
    average_wpm,
    flow_score,
  };

  console.log("Final result:", result);
  return result;
}
