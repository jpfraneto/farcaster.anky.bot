import { GRASSCASTER_FARCASTER_DEVELOPER_MNEMONIC } from "../env/server-env";
import neynarClient from "./neynarClient";
import { mnemonicToAccount } from "viem/accounts";

export const getFid = async () => {
  if (!GRASSCASTER_FARCASTER_DEVELOPER_MNEMONIC) {
    throw new Error("GRASSCASTER_FARCASTER_DEVELOPER_MNEMONIC is not set.");
  }

  const account = mnemonicToAccount(GRASSCASTER_FARCASTER_DEVELOPER_MNEMONIC);

  const { user: farcasterDeveloper } =
    await neynarClient.lookupUserByCustodyAddress({
      custodyAddress: account.address,
    });

  return Number(farcasterDeveloper.fid);
};
