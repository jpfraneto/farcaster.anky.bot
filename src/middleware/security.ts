import { MiddlewareHandler } from "hono";
import { Logger } from "../../utils/Logger";

export const frontendApiKeyMiddleware: MiddlewareHandler = async (c, next) => {
  console.log("IN HERE");
  const apiSecret = c.req.header("x-api-key");

  if (!apiSecret) {
    Logger.warn("Unauthorized: Missing x-api-key header");
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (apiSecret !== process.env.FRONTEND_API_KEY) {
    Logger.warn("Unauthorized: Invalid API key attempt");
    return c.json({ error: "Unauthorized" }, 401);
  }
  console.log("NEXT");
  await next();
};

export const apiKeyMiddleware: MiddlewareHandler = async (c, next) => {
  const apiSecret = c.req.header("x-api-key");

  if (!apiSecret) {
    Logger.warn("Unauthorized: Missing x-api-key header");
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (apiSecret !== process.env.API_KEY) {
    Logger.warn("Unauthorized: Invalid API key attempt");
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
};
