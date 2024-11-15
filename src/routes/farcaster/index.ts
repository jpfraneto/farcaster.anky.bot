import axios from "axios";
import { Frog } from "frog";
import { checkAnkyApiKey } from "../../../middleware";
import { Logger } from "../../../utils/Logger";
export const farcasterApp = new Frog({
  // Supply a Hub to enable frame verification.
  // hub: neynar({ apiKey: 'NEYNAR_FROG_FM' }),
  title: "Anky Farcaster",
});

export default farcasterApp;
