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
import path from "path";
import fs from "fs";
import { askAnkyForCastText } from "./anky";
import { isUserFollowedByUser } from "../src/routes/clanker/functions";
import { Cast } from "../src/types/farcaster";
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

export async function sendDCsToSubscribedUsers(
  tokenAddress: string,
  deployerUsername: string,
  deployerFid: number,
  castHash: string,
  imageUrl: string,
  reply_cast_hash: string
) {
  // Read the notification-fids.json file
  const notificationsFilePath = path.join(
    process.cwd(),
    "notification-fids.json"
  );

  try {
    // Check if file exists
    if (!fs.existsSync(notificationsFilePath)) {
      console.log("No subscribers found");
      return;
    }

    // Read subscribed FIDs
    const subscribedFids = JSON.parse(
      fs.readFileSync(notificationsFilePath, "utf8")
    );
    console.log("THE SUBSCRIBED FIDS ARE", subscribedFids);
    console.log("SENDING DCS TO", subscribedFids.length, "USERS");

    // Map through each FID and send notification
    await Promise.all(
      subscribedFids.map(async (fid: number) => {
        try {
          console.log(`Sending notification to FID: ${fid}`);

          const isFollowedByUserThatIsGoingToBeNotified =
            await isUserFollowedByUser(deployerFid, fid);

          Logger.info(
            `the isFollowedByUserThatIsGoingToBeNotified variable is set to ${isFollowedByUserThatIsGoingToBeNotified}, with deployerFid ${deployerFid} and fid ${fid}`
          );
          if (isFollowedByUserThatIsGoingToBeNotified) {
            await sendDC(
              fid,
              tokenAddress,
              deployerUsername,
              castHash,
              imageUrl,
              reply_cast_hash
            );
          }
        } catch (error) {
          console.error(`Error sending notification to FID ${fid}:`, error);
        }
      })
    );
  } catch (error) {
    console.error("Error processing notifications:", error);
  }
}

export async function sendDC(
  fid: number,
  tokenAddress: string,
  deployerUsername: string,
  castHash: string,
  imageUrl: string,
  reply_cast_hash: string
) {
  try {
    const uuid = crypto.randomUUID();
    const response = await axios.put(
      "https://api.warpcast.com/v2/ext-send-direct-cast",
      {
        recipientFid: fid,
        message: `https://www.warpcast.com/anky.eth/${reply_cast_hash}`,
        idempotencyKey: uuid,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.ANKY_WARPCAST_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    Logger.info(`DC sent to ${fid}`);
    return true;
  } catch (error: any) {
    try {
      console.log(
        "ERROR SENDING DC",
        error.response?.data.errors || error.data.errors
      );
      return false;
    } catch (error) {
      console.log("ERROR SENDING DC", error);
      return false;
    }
  }
}

export async function replyToThisCastWithTokenInformation(
  cast_hash: string,
  deployer_of_token_fid: string,
  token_address: string,
  maxRetries = 3,
  initialDelay = 1000,
  token_author: string,
  text_of_deployment_cast: string
): Promise<string> {
  const random_uuid = crypto.randomUUID();

  async function attemptReply(attempt = 1): Promise<string> {
    try {
      Logger.info(
        `Replying to cast ${cast_hash} (attempt ${attempt}, from ${token_author})`
      );
      const reply_text = await askAnkyForCastText(
        Number(deployer_of_token_fid),
        cast_hash,
        token_author,
        text_of_deployment_cast
      );

      const options = {
        method: "POST",
        url: "https://api.neynar.com/v2/farcaster/cast",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-api-key": process.env.NEYNAR_API_KEY,
        },
        data: {
          signer_uuid: process.env.NEYNAR_SIGNER_UUID,
          text: reply_text,
          embeds: [
            { url: `https://farcaster.anky.bot/token/${token_address}` },
          ],
          parent: cast_hash,
          idem: random_uuid,
          parent_author_fid: 874542,
        },
      };

      const response = await axios.request(options);
      const reply_cast_hash = response.data.hash;
      Logger.info(
        `Successfully replied to cast ${cast_hash}, the cast hash of the reply from @anky.eth is: ${reply_cast_hash}`
      );

      return reply_cast_hash;
    } catch (error) {
      if (attempt >= maxRetries) {
        Logger.error(`Failed to reply after ${maxRetries} attempts`, error);
        throw error;
      }

      const delay = initialDelay * Math.pow(2, attempt - 1);
      Logger.info(`Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return attemptReply(attempt + 1);
    }
  }

  try {
    return await attemptReply();
  } catch (error) {
    Logger.error("Error replying to cast with token information", error);
    throw error;
  }
}

export async function getUsersBestTenCasts(fid: number): Promise<Cast[]> {
  try {
    const options = {
      method: "GET",
      url: `https://api.neynar.com/v2/farcaster/feed/user/popular?fid=${fid}`,
      headers: {
        accept: "application/json",
        "x-api-key": process.env.NEYNAR_API_KEY,
      },
    };

    const response = await axios.request(options);
    return response.data.casts;
  } catch (error) {
    console.error("Error fetching user's best casts:", error);
    throw error;
  }
}
