import { Button, Frog } from "frog";
import { Logger } from "../../../utils/Logger";
import {
  getUserNotificationDetails,
  setUserNotificationDetails,
} from "../../../utils/notifications";
import {
  sendNotificationResponseSchema,
  SendNotificationRequest,
} from "../../../src/types/farcaster";

const appUrl = "https://appreciation.orbiter.website";

export const appreciationFrame = new Frog({
  title: "Appreciation",
});

appreciationFrame.use(async (c, next) => {
  Logger.info(`[${c.req.method}] : : :  ${c.req.url}`);
  c.res.headers.set("Cache-Control", "max-age=0");
  await next();
});

appreciationFrame.get("/add-frame", async (c) => {
  return c.json({ 123: 456 });
});

appreciationFrame.post("/frames-webhook", async (c) => {
  try {
    const body = await c.req.json();
    console.log("the body is ", body);
    Logger.info("frames-webhook body", body);
    setUserNotificationDetails(16098, {
      token: body.token,
      url: body.url,
    });
    appreciationSendFrameNotification({
      fid: body,
      title: "🌞 How was your Day?",
      body: "Its been 24 hours. Tell us something you appreciate today.",
      newTargetUrl: "https://appreciation.orbiter.website",
    });
    return c.json({ 123: 456 });
  } catch (error) {
    console.error("Error in frames-webhook:", error);
    return c.json({ success: false, error: "Internal server error" }, 500);
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
