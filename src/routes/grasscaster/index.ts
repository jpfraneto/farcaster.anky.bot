import { Hono } from "hono";

export const grasscasterRoute = new Hono();

grasscasterRoute.get("/", (c) => {
  return c.text("Hello from the grasscaster route!");
});
