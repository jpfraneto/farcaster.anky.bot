import { Hono } from "hono";

export const grasscaster = new Hono();

grasscaster.get("/", (c) => {
  return c.text("Hello from the grasscaster route!");
});
