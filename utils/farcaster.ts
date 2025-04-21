import { randomUUID } from "crypto";
import { db } from "../database/prisma";
import { Logger } from "./Logger";

type NotificationDetails = {
  url: string;
  token: string;
  enabled: boolean;
};

type SendNotificationRequest = {
  notificationId: string;
  title: string;
  body: string;
  targetUrl: string;
  tokens: string[];
};

type SendFrameNotificationResult =
  | { state: "success" }
  | { state: "no_token" }
  | { state: "rate_limit" }
  | { state: "error"; error: unknown };

const sendNotificationResponseSchema = {
  safeParse: (data: any) => {
    try {
      // Basic validation of the response
      if (!data || typeof data !== "object") {
        return { success: false, error: { errors: "Invalid response format" } };
      }

      if (!data.result || typeof data.result !== "object") {
        return { success: false, error: { errors: "Missing result object" } };
      }

      if (!Array.isArray(data.result.rateLimitedTokens)) {
        return {
          success: false,
          error: { errors: "Missing rateLimitedTokens array" },
        };
      }

      return { success: true, data };
    } catch (error) {
      return { success: false, error: { errors: error } };
    }
  },
};

/**
 * Get notification details for a user from the database
 */
async function getUserNotificationDetails(
  fid: number
): Promise<NotificationDetails | null> {
  try {
    const user = await db.user.findUnique({
      where: { fid },
      include: {
        appConnections: {
          where: {
            app: {
              name: "appreciation",
            },
            notificationsEnabled: true,
          },
          select: {
            notificationUrl: true,
            notificationToken: true,
          },
        },
      },
    });

    if (!user || !user.appConnections.length) {
      return null;
    }

    return {
      url: user.appConnections[0].notificationUrl || "",
      token: user.appConnections[0].notificationToken || "",
      enabled: true,
    };
  } catch (error) {
    Logger.error("Error fetching user notification details:", error);
    return null;
  }
}

/**
 * Send a notification to a Farcaster user
 */
export async function sendMiniAppNotification({
  fid,
  title,
  body,
  appName,
  targetUrl,
}: {
  fid: number;
  title: string;
  body: string;
  appName: string;
  targetUrl: string;
}): Promise<SendFrameNotificationResult> {
  const details = await getUserNotificationDetails(fid);
  if (!details) {
    return { state: "no_token" };
  }

  try {
    // Store the notification in the database
    await db.notification.create({
      data: {
        appName,
        userId: fid,
        title,
        content: body,
        sentAt: new Date(),
      },
    });

    const response = await fetch(details.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        notificationId: randomUUID(),
        title,
        body,
        targetUrl,
        tokens: [details.token],
      } satisfies SendNotificationRequest),
    });

    const responseJson = await response.json();

    if (response.status === 200) {
      const responseBody =
        sendNotificationResponseSchema.safeParse(responseJson);
      if (responseBody.success === false) {
        return {
          state: "error",
          error: responseBody.error?.errors || "Unknown error",
        };
      }

      if (responseBody.data.result.rateLimitedTokens.length) {
        return { state: "rate_limit" };
      }

      return { state: "success" };
    } else {
      return { state: "error", error: responseJson };
    }
  } catch (err) {
    Logger.error("Error sending notification:", err);
    return { state: "error", error: err };
  }
}
