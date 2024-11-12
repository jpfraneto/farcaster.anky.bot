import axios from "axios";
import { Logger } from "./Logger";
import {
  ID_REGISTRY_ADDRESS,
  ViemLocalEip712Signer,
  idRegistryABI,
} from "@farcaster/hub-nodejs";
import { bytesToHex, createPublicClient, http } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { optimism } from "viem/chains";

const publicClient = createPublicClient({
  chain: optimism,
  transport: http(),
});

const getDeadline = () => {
  const now = Math.floor(Date.now() / 1000);
  const oneHour = 60 * 60;
  return BigInt(now + oneHour);
};

export async function createNewFid(
  requested_user_custory_address: string,
  signature: string,
  new_user_username: string
) {
  try {
    const options = {
      method: "GET",
      url: "https://api.neynar.com/v2/farcaster/user/fid",
      headers: {
        api_key: process.env.NEYNAR_API_KEY as string,
      },
    };

    const response = await axios.request(options);
    const new_fid = response.data.fid;
    Logger.info(`New fid available: ${new_fid}`);

    const deadline = getDeadline();

    const thing_that_i_need_to_send_to_frontend = await derive_from_new_fid(
      deadline,
      new_fid
    );
  } catch (error) {
    Logger.error("Error creating new fid", error);
    throw error;
  }
}

async function derive_from_new_fid(deadline: bigint, new_fid: bigint) {
  /// Do something here
  return {
    deadline,
    new_fid,
  };
}
