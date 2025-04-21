import { Hono } from "hono";
import { NEYNAR_API_KEY, NEYNAR_CLIENT_ID } from "../../../env/server-env";
import {
  ParseWebhookEvent,
  parseWebhookEvent,
  verifyAppKeyWithNeynar,
} from "@farcaster/frame-node";
import { Logger } from "../../../utils/Logger";
import { db } from "../../../database/prisma";
import { sendMiniAppNotification } from "../../../utils/farcaster";
import { PrismaClient } from "@prisma/client";

export const appreciation = new Hono();

appreciation.get("/", (c) => {
  return c.text("Hello from the appreciation route!");
});

appreciation.post("/frames-webhook", async (c) => {
  try {
    const requestJson = await c.req.json();
    const neynarEnabled = NEYNAR_API_KEY && NEYNAR_CLIENT_ID;
    if (!neynarEnabled) {
      return c.json({
        success: true,
        message: "Neynar is not enabled, skipping webhook processing",
      });
    }

    let data;
    try {
      data = await parseWebhookEvent(requestJson, verifyAppKeyWithNeynar);
    } catch (e) {
      const error = e as ParseWebhookEvent.ErrorType;

      Logger.error(`Webhook parsing error: ${error.name} - ${error.message}`);

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

    // Use a transaction to ensure all database operations are atomic
    await db.$transaction(async (tx) => {
      // Get or create the App record for "appreciation" in a single operation
      const app = await tx.app.upsert({
        where: { name: "appreciation" },
        update: {},
        create: { name: "appreciation" },
      });

      // Handle different event types
      switch (event.event) {
        case "frame_added":
          if (event.notificationDetails) {
            // First, ensure the user exists
            await tx.user.upsert({
              where: { fid },
              update: {},
              create: { fid },
            });

            // Then create or update the UserAppConnection
            await tx.userAppConnection.upsert({
              where: {
                userId_appId: {
                  userId: fid,
                  appId: app.id,
                },
              },
              update: {
                notificationUrl: event.notificationDetails.url,
                notificationToken: event.notificationDetails.token,
                notificationsEnabled: true,
              },
              create: {
                userId: fid,
                appId: app.id,
                notificationUrl: event.notificationDetails.url,
                notificationToken: event.notificationDetails.token,
                notificationsEnabled: true,
              },
            });

            // Send notification
            await sendMiniAppNotification({
              appName: "appreciation",
              fid,
              title: "Welcome to Appreciation",
              body: "Thanks for adding the frame. You'll receive a daily reminder to appreciate something.",
              targetUrl: "https://appreciation.lat",
            });
          }
          break;

        case "frame_removed":
          // Update the UserAppConnection to disable notifications
          await tx.userAppConnection.update({
            where: {
              userId_appId: {
                userId: fid,
                appId: app.id,
              },
            },
            data: {
              notificationsEnabled: false,
            },
          });
          break;

        case "notifications_enabled":
          if (event.notificationDetails) {
            // Update notification details in the UserAppConnection
            await tx.userAppConnection.update({
              where: {
                userId_appId: {
                  userId: fid,
                  appId: app.id,
                },
              },
              data: {
                notificationUrl: event.notificationDetails.url,
                notificationToken: event.notificationDetails.token,
                notificationsEnabled: true,
              },
            });
          }
          break;

        case "notifications_disabled":
          // Update notification status in the UserAppConnection
          await tx.userAppConnection.update({
            where: {
              userId_appId: {
                userId: fid,
                appId: app.id,
              },
            },
            data: {
              notificationsEnabled: false,
            },
          });
          Logger.info(`Notifications disabled for user ${fid}`);
          break;
      }
    });

    return c.json({
      success: true,
      message: `Successfully processed ${event.event} event for FID ${fid}`,
    });
  } catch (error) {
    Logger.error("Error processing webhook:", error);
    if (error instanceof Error) {
      return c.json({ success: false, error: error.message }, 500);
    }
    return c.json({ success: false, error: "An unknown error occurred" }, 500);
  }
});
