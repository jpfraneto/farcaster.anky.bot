import {
  SendNotificationRequest,
  sendNotificationResponseSchema,
} from "@farcaster/frame-sdk";
import fs from "fs";
import path from "path";

const appUrl = "https://framesgiving.anky.bot";

type SendFrameNotificationResult =
  | {
      state: "error";
      error: unknown;
    }
  | { state: "no_token" }
  | { state: "rate_limit" }
  | { state: "success" };

export async function getUserNotificationDetails(fid: number) {
  try {
    const notificationsPath = path.join(
      process.cwd(),
      "data/framesgiving/notifications_tokens.txt"
    );

    if (!fs.existsSync(notificationsPath)) {
      return null;
    }

    const fileContent = fs.readFileSync(notificationsPath, "utf-8");
    const lines = fileContent.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      const [existingFid, token, url, targetUrl] = line.trim().split(" ");
      if (existingFid === fid.toString()) {
        return { token, url, targetUrl };
      }
    }
    return null;
  } catch (error) {
    console.error("Error getting notification details:", error);
    return null;
  }
}

export async function setUserNotificationDetails(
  fid: number,
  notificationDetails: any
) {
  try {
    const notificationsPath = path.join(
      process.cwd(),
      "data/framesgiving/notifications_tokens.txt"
    );

    // Create directory if it doesn't exist
    const dir = path.dirname(notificationsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Create file if it doesn't exist
    if (!fs.existsSync(notificationsPath)) {
      fs.writeFileSync(notificationsPath, "");
    }

    const fileContent = fs.readFileSync(notificationsPath, "utf-8");
    const lines = fileContent.split("\n").filter((line) => line.trim());

    // Remove existing entry for this FID
    const filteredLines = lines.filter((line) => {
      const [existingFid] = line.trim().split(" ");
      return existingFid !== fid.toString();
    });

    // Add new entry
    filteredLines.push(
      `${fid} ${notificationDetails.token} ${notificationDetails.url} ${notificationDetails.targetUrl}`
    );

    // Write back to file
    fs.writeFileSync(notificationsPath, filteredLines.join("\n") + "\n");
  } catch (error) {
    console.error("Error setting notification details:", error);
    throw error;
  }
}

export async function deleteUserNotificationDetails(fid: number) {
  try {
    const notificationsPath = path.join(
      process.cwd(),
      "data/framesgiving/notifications_tokens.txt"
    );

    if (!fs.existsSync(notificationsPath)) {
      return;
    }

    const fileContent = fs.readFileSync(notificationsPath, "utf-8");
    const lines = fileContent.split("\n").filter((line) => line.trim());

    // Filter out the line with matching FID
    const filteredLines = lines.filter((line) => {
      const [existingFid] = line.trim().split(" ");
      return existingFid !== fid.toString();
    });

    // Write back to file
    fs.writeFileSync(notificationsPath, filteredLines.join("\n") + "\n");
  } catch (error) {
    console.error("Error deleting notification details:", error);
    throw error;
  }
}

export async function sendFrameNotification({
  fid,
  title,
  body,
}: {
  fid: number;
  title: string;
  body: string;
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
      targetUrl: appUrl,
      tokens: [notificationDetails.token],
    } satisfies SendNotificationRequest),
  });

  const responseJson = await response.json();

  if (response.status === 200) {
    const responseBody = sendNotificationResponseSchema.safeParse(responseJson);
    if (responseBody.success === false) {
      // Malformed response
      return { state: "error", error: responseBody.error.errors };
    }

    if (responseBody.data.result.rateLimitedTokens.length) {
      // Rate limited
      return { state: "rate_limit" };
    }

    return { state: "success" };
  } else {
    // Error response
    return { state: "error", error: responseJson };
  }
}
