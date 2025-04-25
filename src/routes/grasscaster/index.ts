import { Hono } from "hono";
import { getSignedKey } from "../../../utils/getSignedKey";
import neynarClient from "../../../utils/neynarClient";

export const grasscasterRoute = new Hono();

grasscasterRoute.get("/", (c) => {
  return c.text("Hello from the grasscaster route!");
});

grasscasterRoute.post("/signer", async (c) => {
  try {
    // This would be the equivalent of getSignedKey() from the example
    // You would need to implement this function elsewhere
    const signedKey = await getSignedKey();
    console.log("the signed key is", signedKey);
    return c.json(signedKey, 200);
  } catch (error) {
    console.error(error);
    return c.json({ error: "An error occurred" }, 500);
  }
});

grasscasterRoute.post("/cast", async (c) => {
  try {
    const body = await c.req.json();
    console.log("the body is", body);

    // Validate that text is present
    if (!body.text) {
      return c.json({ error: "Missing required parameter: text" }, 400);
    }

    // This would be the equivalent of neynarClient.publishCast from the example
    // You would need to implement this client elsewhere
    const cast = await neynarClient.publishCast({
      signerUuid: body.signer_uuid,
      text: body.text,
      channelId: body.channel,
      embeds: body.imageUrl ? [{ url: body.imageUrl }] : undefined,
    });
    console.log("the cast is", cast);

    return c.json({ cast: cast.cast }, 200);
  } catch (error) {
    console.error(error);
    return c.json({ error: "An error occurred" }, 500);
  }
});
