import { MiddlewareHandler } from "hono";
import { Logger } from "../../utils/Logger";

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  Logger.http(`[${c.req.method}] ${c.req.url} - ${duration}ms`);
};
