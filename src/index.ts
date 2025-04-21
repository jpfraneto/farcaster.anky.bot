import dotenv from "dotenv";
dotenv.config();
import { Logger } from "../utils/Logger";

import { Hono } from "hono";
import { cors } from "hono/cors";
import os from "os";

// ROUTES
import { grasscaster } from "./routes/grasscaster";
import { appreciation } from "./routes/appreciation";
import { apiKeyMiddleware } from "./middleware/security";
import { rateLimit } from "./middleware/rateLimit";
import { requestLogger } from "./middleware/logs";
import { logs } from "./routes/logs";
import dbRoute from "./routes/database";

const serverStartTime = Date.now();

const app = new Hono();

app.use(
  "*",
  cors({
    origin: [
      "https://frame.anky.bot",
      "https://anky.bot",
      "https://appreciation.lat",
      "https://doppelganger.lat",
      "https://fartwins.lat",
    ],
    allowHeaders: ["Authorization", "Origin", "Content-Type", "Accept"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Authorization", "Origin", "Content-Type", "Accept"],
    maxAge: 222, // Add timeout config
  })
);

if (process.env.PROXY === "true") {
  app.use("*", (ctx, next) => {
    const wrapped = cors({
      origin,
    });
    return wrapped(ctx, next);
  });
}

app.use(requestLogger);

app.route("/logs", logs);
app.route("/grasscaster", grasscaster);
app.route("/appreciation", appreciation);
app.route("/database", dbRoute);

app.get("/health", (c) => {
  const now = Date.now();
  const uptimeMs = now - serverStartTime;
  const uptimeSec = Math.floor(uptimeMs / 1000);

  const seconds = uptimeSec % 60;
  const minutes = Math.floor((uptimeSec / 60) % 60);
  const hours = Math.floor((uptimeSec / 3600) % 24);
  const days = Math.floor(uptimeSec / 86400);

  const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;

  return c.json({
    status: "ok",
    uptime: uptimeString,
    uptime_seconds: uptimeSec,
    timestamp: new Date(now).toISOString(),
  });
});

app.get("/metrics", apiKeyMiddleware, rateLimit(10, 60_000), (c) => {
  const now = Date.now();
  const uptimeMs = now - serverStartTime;
  const uptimeSec = Math.floor(uptimeMs / 1000);

  const seconds = uptimeSec % 60;
  const minutes = Math.floor((uptimeSec / 60) % 60);
  const hours = Math.floor((uptimeSec / 3600) % 24);
  const days = Math.floor(uptimeSec / 86400);

  const memory = process.memoryUsage(); // Bun supports this too
  const load = os.loadavg(); // requires: import os from "os";

  return c.json({
    status: "ok",
    timestamp: new Date(now).toISOString(),
    uptime: `${days}d ${hours}h ${minutes}m ${seconds}s`,
    uptime_seconds: uptimeSec,
    memory: {
      rss: memory.rss,
      heapTotal: memory.heapTotal,
      heapUsed: memory.heapUsed,
      external: memory.external,
    },
    load_avg: {
      "1min": load[0],
      "5min": load[1],
      "15min": load[2],
    },
  });
});

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
