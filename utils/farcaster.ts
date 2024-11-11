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

export async function createNewFid() {
  try {
    const options = {
      method: "GET",
      url: "https://api.neynar.com/v2/farcaster/user/fid",
      headers: {
        api_key: process.env.NEYNAR_API_KEY as string,
      },
    };

    const response = await axios.request(options);
    const fid = response.data.fid;
    Logger.info(`New fid available: ${fid}`);

    const deadline = getDeadline();
    Logger.info(`Generated deadline: ${parseInt(deadline.toString())}`);

    if (!process.env.ANKY_MNEMONIC) {
      throw new Error("ANKY_MNEMONIC environment variable not set");
    }

    const requestedUserAccount = mnemonicToAccount(process.env.ANKY_MNEMONIC);
    const requestedUserAccountSigner = new ViemLocalEip712Signer(
      requestedUserAccount
    );

    Logger.info(`Custody address: ${requestedUserAccount.address}`);

    const requestedUserNonce = await publicClient.readContract({
      address: ID_REGISTRY_ADDRESS,
      abi: idRegistryABI,
      functionName: "nonces",
      args: [requestedUserAccount.address],
    });

    const requestedUserSignature =
      await requestedUserAccountSigner.signTransfer({
        fid: BigInt(fid),
        to: requestedUserAccount.address,
        nonce: requestedUserNonce,
        deadline,
      });

    if (requestedUserSignature.err) {
      throw new Error("Failed to generate signature");
    }

    const signature = bytesToHex(requestedUserSignature.value);
    Logger.info(`Generated signature: ${signature}`);

    return {
      fid,
      deadline: parseInt(deadline.toString()),
      custodyAddress: requestedUserAccount.address,
      signature,
    };
  } catch (error) {
    Logger.error("Error creating new fid", error);
    throw error;
  }
}
