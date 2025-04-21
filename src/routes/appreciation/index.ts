import { Hono } from "hono";

export const appreciation = new Hono();

appreciation.get("/", (c) => {
  return c.text("Hello from the appreciation route!");
});
