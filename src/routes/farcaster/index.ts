import axios from "axios";
import { Frog } from "frog";
import { checkAnkyApiKey } from "../../../middleware";
import { createNewFid } from "../../../utils/farcaster";
import { Logger } from "../../../utils/Logger";
export const farcasterApp = new Frog({
  // Supply a Hub to enable frame verification.
  // hub: neynar({ apiKey: 'NEYNAR_FROG_FM' }),
  title: "Anky Farcaster",
});

farcasterApp.post(
  "/create-new-farcaster-account",
  checkAnkyApiKey,
  async (c) => {
    const body = await c.req.json();
    const { requested_user_custody_address, signature, new_user_username } =
      body;
    const response = await createNewFid(
      requested_user_custody_address,
      signature,
      new_user_username
    );
    Logger.info(
      `The response from createNewFid is: ${JSON.stringify(response)}`
    );
    return c.json({ 123: 456 });
  }
);

export default farcasterApp;
