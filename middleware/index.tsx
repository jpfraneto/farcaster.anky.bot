import { Context } from "hono";
import { Logger } from "../utils/Logger";

export async function checkAnkyApiKey(c: Context, next: () => Promise<void>) {
  const apiKey = c.req.header("x-anky-api-key");

  if (!apiKey) {
    Logger.error("Missing API key in request headers");
    return c.json(
      {
        success: false,
        message: "Unauthorized - Missing API key",
      },
      401
    );
  }

  if (apiKey !== process.env.ANKY_API_API_KEY) {
    Logger.error("Invalid API key provided");
    return c.json(
      {
        success: false,
        message: "Unauthorized - Invalid API key",
      },
      401
    );
  }

  await next();
}
