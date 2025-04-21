import { MiddlewareHandler } from "hono";
import { Logger } from "../../utils/Logger";

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const start = Date.now();

  // Log the request before processing
  const ip =
    c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";

  // Use the Logger instead of console.log for consistent formatting and colors
  Logger.http(`[${c.req.method}] ${c.req.url} - IP: ${ip}`);

  await next();

  const duration = Date.now() - start;

  // Use the Logger instead of console.log for consistent formatting and colors
  Logger.http(
    `[${c.req.method}] ${c.req.url} - ${duration}ms - Status: ${c.res.status}`
  );
};
