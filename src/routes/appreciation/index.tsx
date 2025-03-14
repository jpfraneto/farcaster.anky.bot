import { Button, Frog } from "frog";
import { Logger } from "../../../utils/Logger";

export const appreciationFrame = new Frog({
  title: "Appreciation",
});

appreciationFrame.use(async (c, next) => {
  Logger.info(`[${c.req.method}] : : :  ${c.req.url}`);
  c.res.headers.set("Cache-Control", "max-age=0");
  await next();
});

appreciationFrame.get("/add-frame", async (c) => {
  return c.json({ 123: 456 });
});

appreciationFrame.post("/frames-webhook", async (c) => {
  const body = await c.req.json();
  Logger.info("frames-webhook body", body);
  sendNotificationToUser(16098);
  return c.json({ 123: 456 });
});

async function sendNotificationToUser(fid: number) {
  console.log("now it is time to send a notification to the user ", fid);
}
