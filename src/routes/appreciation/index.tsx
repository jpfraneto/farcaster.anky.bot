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
  console.log("📨 Received webhook event");
  const requestJson = await c.req.json();

  let data;
  try {
    console.log("🔐 Verifying webhook signature...");
    data = await parseWebhookEvent(requestJson, verifyAppKeyWithNeynar);
  } catch (e: unknown) {
    console.log("❌ Webhook verification failed");
    const error = e as ParseWebhookEvent.ErrorType;

    switch (error.name) {
      case "VerifyJsonFarcasterSignature.InvalidDataError":
      case "VerifyJsonFarcasterSignature.InvalidEventDataError":
        return c.json({ success: false, error: error.message }, 400);
      case "VerifyJsonFarcasterSignature.InvalidAppKeyError":
        return c.json({ success: false, error: error.message }, 401);
      case "VerifyJsonFarcasterSignature.VerifyAppKeyError":
        return c.json({ success: false, error: error.message }, 500);
    }
  }

  const fid = data.fid;
  const event = data.event;
  console.log(
    `👤 Processing event for FID: ${fid}, Event type: ${event.event}`
  );

  switch (event.event) {
    case "frame_added":
      console.log("🎉 Frame added event");
      if (event.notificationDetails) {
        console.log("📝 Setting notification details");
        await setUserNotificationDetails(fid, event.notificationDetails);
        await appreciationSendFrameNotification({
          fid,
          title: "Welcome to Appreciation",
          body: "Frame is now added to your client",
          newTargetUrl: appUrl,
        });
      } else {
        console.log("🗑️ No notification details, removing existing");
        await deleteUserNotificationDetails(fid);
      }
      break;

    case "frame_removed":
      console.log("👋 Frame removed event");
      await deleteUserNotificationDetails(fid);
      break;

    case "notifications_enabled":
      console.log("🔔 Notifications enabled event");
      await setUserNotificationDetails(fid, event.notificationDetails);
      await appreciationSendFrameNotification({
        fid,
        title: "🌞 Notifications Enabled",
        body: "You'll now receive daily appreciation reminders",
        newTargetUrl: appUrl,
      });
      break;

    case "notifications_disabled":
      console.log("🔕 Notifications disabled event");
      await deleteUserNotificationDetails(fid);
      break;
  }

  console.log("✅ Webhook processing complete");
  return c.json({ success: true });
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
