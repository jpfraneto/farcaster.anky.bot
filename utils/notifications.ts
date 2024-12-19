import { createClient } from "redis";
import {
  getAnkyverseDayForGivenTimestamp,
  getCurrentAnkyverseDay,
} from "./ankyverse";
import axios from "axios";
import { getUpcomingPromptForUser } from "../src/routes/framesgiving";
import {
  sendNotificationResponseSchema,
  SendNotificationRequest,
  FrameNotificationDetails,
} from "../src/types/farcaster.js";

interface UserWritingStatus {
  hasWrittenToday: boolean;
  lastWritingTimestamp: number;
}

// Initialize Redis client
const redis = createClient({
  url: "redis://127.0.0.1:6379",
});

// Connect to Redis
redis.connect().catch(console.error);

// Handle Redis connection events
redis.on("error", (err) => console.error("Redis Client Error:", err));
redis.on("connect", () => console.log("Redis Client Connected"));

// This should be your Farcaster Frame URL
const appUrl = "https://framesgiving.anky.bot";

type SendFrameNotificationResult =
  | { state: "error"; error: unknown }
  | { state: "no_token" }
  | { state: "rate_limit" }
  | { state: "success" };

function getUserNotificationDetailsKey(fid: number): string {
  return `frames:notification:${fid}`;
}

export async function getUserNotificationDetails(
  fid: number
): Promise<FrameNotificationDetails | null> {
  try {
    const data = await redis.get(getUserNotificationDetailsKey(fid));
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error("Error getting notification details:", error);
    return null;
  }
}

export async function setUserNotificationDetails(
  fid: number,
  notificationDetails: FrameNotificationDetails
): Promise<void> {
  try {
    await redis.set(
      getUserNotificationDetailsKey(fid),
      JSON.stringify(notificationDetails),
      {
        // Optional: Set expiration time (e.g., 30 days)
        EX: 60 * 60 * 24 * 30,
      }
    );
  } catch (error) {
    console.error("Error setting notification details:", error);
    throw error;
  }
}

export async function deleteUserNotificationDetails(
  fid: number
): Promise<void> {
  try {
    await redis.del(getUserNotificationDetailsKey(fid));
  } catch (error) {
    console.error("Error deleting notification details:", error);
    throw error;
  }
}

export async function sendFrameNotification({
  fid,
  title,
  body,
  newTargetUrl,
}: {
  fid: number;
  title: string;
  body: string;
  newTargetUrl?: string;
}): Promise<SendFrameNotificationResult> {
  const notificationDetails = await getUserNotificationDetails(fid);
  if (!notificationDetails) {
    return { state: "no_token" };
  }

  const response = await fetch(notificationDetails.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      notificationId: crypto.randomUUID(),
      title,
      body,
      targetUrl: newTargetUrl ?? appUrl,
      tokens: [notificationDetails.token],
    } satisfies SendNotificationRequest),
  });

  const responseJson = await response.json();

  if (response.status === 200) {
    const responseBody = sendNotificationResponseSchema.safeParse(responseJson);
    if (responseBody.success === false) {
      return { state: "error", error: responseBody.error.errors };
    }

    if (responseBody.data.result.rateLimitedTokens.length) {
      return { state: "rate_limit" };
    }

    return { state: "success" };
  } else {
    return { state: "error", error: responseJson };
  }
}

// Graceful shutdown handler
process.on("SIGTERM", async () => {
  console.log("SIGTERM received. Closing Redis connection...");
  await redis.quit();
  process.exit(0);
});

export async function checkUserWritingStatus(
  fid: number
): Promise<UserWritingStatus> {
  try {
    const currentDay = getCurrentAnkyverseDay();
    const response = await axios.get(
      `https://ponder.anky.bot/writer/${fid}/sessions?limit=1`
    );

    if (!response.data?.items?.length) {
      return { hasWrittenToday: false, lastWritingTimestamp: 0 };
    }

    const latestSession = response.data.items[0];
    const sessionDate = new Date(Number(latestSession.startTime));
    const sessionAnkyverseDay = getAnkyverseDayForGivenTimestamp(
      sessionDate.getTime()
    );

    const hasWrittenToday =
      sessionAnkyverseDay.currentSojourn === currentDay.currentSojourn &&
      sessionAnkyverseDay.wink === currentDay.wink;

    return {
      hasWrittenToday,
      lastWritingTimestamp: Number(latestSession.startTime),
    };
  } catch (error) {
    console.error("Error checking user writing status:", error);
    throw error;
  }
}

export async function getAllNotificationUsers(): Promise<number[]> {
  try {
    const keys = await redis.keys("frames:notification:*");
    return keys.map((key) => parseInt(key.split(":")[2]));
  } catch (error) {
    console.error("Error getting notification users:", error);
    return [];
  }
}

export async function checkAndNotifyUsers() {
  const currentDay = getCurrentAnkyverseDay();

  // Don't send notifications during Great Slumber
  if (currentDay.status === "Great Slumber") {
    console.log("Currently in Great Slumber - skipping notifications");
    return;
  }

  try {
    const users = await getAllNotificationUsers();
    console.log(`Checking ${users.length} users for notifications`);

    for (const fid of users) {
      try {
        const status = await checkUserWritingStatus(fid);

        if (!status.hasWrittenToday) {
          const upcomingPrompt = await getUpcomingPromptForUser(fid.toString());
          const encodedPrompt = encodeURIComponent(upcomingPrompt);
          await sendFrameNotification({
            fid,
            title: `You have not written your anky today`,
            body: `${upcomingPrompt}`,
            newTargetUrl: `https://framesgiving.anky.bot?prompt=${encodedPrompt}`,
          });
          console.log(`Notification sent to user ${fid}`);
        }
      } catch (error) {
        console.error(`Error processing user ${fid}:`, error);
      }
    }
  } catch (error) {
    console.error("Error in checkAndNotifyUsers:", error);
  }
}

const NOTIFICATION_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
let notificationInterval: NodeJS.Timer;

export function startNotificationScheduler() {
  console.log("STARTING THE NOTIFICATIONS SCHEDULER");
  // Clear any existing interval
  if (notificationInterval) {
    clearInterval(notificationInterval);
  }

  // Run immediately on startup
  checkAndNotifyUsers();

  // Schedule regular checks
  notificationInterval = setInterval(
    checkAndNotifyUsers,
    NOTIFICATION_INTERVAL
  );

  console.log("Notification scheduler started");
}

process.on("SIGTERM", () => {
  console.log("SIGTERM received, stopping notification scheduler");
  if (notificationInterval) {
    clearInterval(notificationInterval);
  }
  process.exit(0);
});
