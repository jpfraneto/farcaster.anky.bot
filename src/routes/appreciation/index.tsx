import { Button, Frog } from "frog";
import { Logger } from "../../../utils/Logger";
import {
  getUserNotificationDetails,
  setUserNotificationDetails,
  deleteUserNotificationDetails,
} from "../../../utils/notifications";
import {
  sendNotificationResponseSchema,
  SendNotificationRequest,
} from "../../../src/types/farcaster";
import {
  ParseWebhookEvent,
  parseWebhookEvent,
  verifyAppKeyWithNeynar,
} from "@farcaster/frame-node";

const appUrl = "https://appreciation.orbiter.website";

export const appreciationFrame = new Frog({
  title: "Appreciation",
});

appreciationFrame.use(async (c, next) => {
  console.log(`🔍 Incoming request: [${c.req.method}] ${c.req.url}`);
  Logger.info(`[${c.req.method}] : : :  ${c.req.url}`);
  c.res.headers.set("Cache-Control", "max-age=0");
  await next();
});

appreciationFrame.get("/add-frame", async (c) => {
  console.log("➕ Handling add-frame request");
  return c.json({ 123: 456 });
});

appreciationFrame.post("/frames-webhook", async (c) => {
  console.log("🎯 Received webhook request to /frames-webhook");
  console.log("🔑 Using API key:", process.env.NEYNAR_API_KEY);

  try {
    const requestJson = await c.req.json();
    console.log(
      "📥 Received request JSON:",
      JSON.stringify(requestJson, null, 2)
    );

    let data;
    try {
      console.log("🔐 Attempting to parse and verify webhook event...");
      data = await parseWebhookEvent(requestJson, verifyAppKeyWithNeynar);
      console.log(
        "✅ Successfully parsed webhook event. Data:",
        JSON.stringify(data, null, 2)
      );
    } catch (e: unknown) {
      console.error("❌ Failed to parse webhook event:", e);
      const error = e as ParseWebhookEvent.ErrorType;

      switch (error.name) {
        case "VerifyJsonFarcasterSignature.InvalidDataError":
        case "VerifyJsonFarcasterSignature.InvalidEventDataError":
          console.error("📛 Invalid request data:", error.message);
          return c.json(
            { success: false, error: error.message },
            { status: 400 }
          );
        case "VerifyJsonFarcasterSignature.InvalidAppKeyError":
          console.error("🔑 Invalid app key:", error.message);
          return c.json(
            { success: false, error: error.message },
            { status: 401 }
          );
        case "VerifyJsonFarcasterSignature.VerifyAppKeyError":
          console.error("💥 Error verifying app key:", error.message);
          return c.json(
            { success: false, error: error.message },
            { status: 500 }
          );
      }
    }

    const fid = data.fid;
    const event = data.event;
    console.log(`👤 Processing event for FID ${fid}:`, event.event);

    switch (event.event) {
      case "frame_added":
        console.log("➕ Frame added event received");
        if (event.notificationDetails) {
          console.log("📝 Setting notification details for FID:", fid);
          await setUserNotificationDetails(fid, event.notificationDetails);
          console.log("🔔 Sending welcome notification");
          await appreciationSendFrameNotification({
            fid,
            title: "Welcome to Appreciation!",
            body: "You'll receive daily appreciation reminders. Stay tuned!",
            newTargetUrl: appUrl,
          });
        } else {
          console.log("⚠️ No notification details present, removing existing");
          await deleteUserNotificationDetails(fid);
        }
        break;

      case "frame_removed":
        console.log("➖ Frame removed event received for FID:", fid);
        await deleteUserNotificationDetails(fid);
        break;

      case "notifications_enabled":
        console.log("🔔 Notifications enabled for FID:", fid);
        await setUserNotificationDetails(fid, event.notificationDetails);
        await appreciationSendFrameNotification({
          fid,
          title: "Welcome to Appreciation!",
          body: "You'll receive daily appreciation reminders. Stay tuned!",
          newTargetUrl: appUrl,
        });
        break;

      case "notifications_disabled":
        console.log("🔕 Notifications disabled for FID:", fid);
        await deleteUserNotificationDetails(fid);
        break;
    }

    console.log("✅ Successfully processed webhook event");
    return c.json({ success: true });
  } catch (error) {
    console.error("💥 Unexpected error processing webhook:", error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
});

type SendFrameNotificationResult =
  | { state: "error"; error: unknown }
  | { state: "no_token" }
  | { state: "rate_limit" }
  | { state: "success" };

export async function appreciationSendFrameNotification({
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
  console.log(`📤 Sending notification to FID: ${fid}`);
  const notificationDetails = await getUserNotificationDetails(fid);
  if (!notificationDetails) {
    console.log("⚠️ No notification token found");
    return { state: "no_token" };
  }

  console.log("🚀 Making notification request");
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
    console.log("📬 Notification request successful");
    const responseBody = sendNotificationResponseSchema.safeParse(responseJson);
    if (responseBody.success === false) {
      console.log("❌ Invalid response format");
      return { state: "error", error: responseBody.error.errors };
    }

    if (responseBody.data.result.rateLimitedTokens.length) {
      console.log("⏳ Rate limit hit");
      return { state: "rate_limit" };
    }

    console.log("✨ Notification sent successfully");
    return { state: "success" };
  } else {
    console.log("❌ Notification request failed");
    return { state: "error", error: responseJson };
  }
}
