import { Hono } from "hono";
import { apiKeyMiddleware } from "../../middleware/security";
import fs from "fs/promises";
import path from "path";

const logs = new Hono();

logs.use("*", apiKeyMiddleware);

logs.get("/", async (c) => {
  const level = c.req.query("level") || "combined";
  const count = parseInt(c.req.query("lines") || "100");
  const fileMap: Record<string, string> = {
    error: "logs/error.log",
    combined: "logs/combined.log",
  };

  const filePath = fileMap[level];

  if (!filePath) {
    return c.json({ error: "Invalid log level" }, 400);
  }

  try {
    const raw = await fs.readFile(path.resolve(filePath), "utf-8");
    const lines = raw.trim().split("\n").slice(-count);
    return c.json({ logs: lines });
  } catch (err) {
    return c.json({ error: "Could not read logs" }, 500);
  }
});

export { logs };
