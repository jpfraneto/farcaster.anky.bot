import dotenv from "dotenv";
dotenv.config();
import { Logger } from "../utils/Logger";

import { Hono } from "hono";
import { cors } from "hono/cors";

// ROUTES
import { grasscaster } from "./routes/grasscaster";
import { appreciation } from "./routes/appreciation";

const app = new Hono();

if (process.env.PROXY === "true") {
  app.use("*", (ctx, next) => {
    const wrapped = cors({
      origin,
    });
    return wrapped(ctx, next);
  });
}

app.use(async (c, next) => {
  Logger.info(`[${c.req.method}] ${c.req.url.split("?")[0]}`);
  await next();
});

app.route("/grasscaster", grasscaster);
app.route("/appreciation", appreciation);

app.get("/", (c) => {
  console.log("Hello Hono!");
  return c.text("Hello Hono!");
});

if (typeof Bun !== "undefined") {
  const port = process.env.PORT || 3000;
  Bun.serve({
    fetch: app.fetch,
    port,
  });
  console.log(`Server is running on port ${port}`);
}
