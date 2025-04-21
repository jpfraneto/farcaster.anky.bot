import { MiddlewareHandler } from "hono";
import { Logger } from "../../utils/Logger";

export const apiKeyMiddleware: MiddlewareHandler = async (c, next) => {
  const apiSecret = c.req.header("x-api-key");

  if (!apiSecret) {
    Logger.warn("Unauthorized: Missing x-api-key header");
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (apiSecret !== process.env.API_SECRET) {
    Logger.warn("Unauthorized: Invalid API key attempt");
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
};
