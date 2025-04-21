import { MiddlewareHandler } from "hono";

const rateLimitMap = new Map<string, { count: number; lastRequest: number }>();

export const rateLimit = (
  maxRequests: number,
  windowMs: number
): MiddlewareHandler => {
  return async (c, next) => {
    const ip =
      c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
    const now = Date.now();

    const record = rateLimitMap.get(ip) || { count: 0, lastRequest: now };

    if (now - record.lastRequest > windowMs) {
      rateLimitMap.set(ip, { count: 1, lastRequest: now });
    } else {
      if (record.count >= maxRequests) {
        return c.json({ error: "Too many requests" }, 429);
      }
      rateLimitMap.set(ip, {
        count: record.count + 1,
        lastRequest: record.lastRequest,
      });
    }

    await next();
  };
};
