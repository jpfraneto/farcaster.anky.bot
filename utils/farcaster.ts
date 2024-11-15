import axios from "axios";
import { Logger } from "./Logger";

import path from "path";
import fs from "fs";
import { askAnkyForCastText } from "./anky";
import { isUserFollowedByUser } from "../src/routes/clanker/functions";
import { Cast } from "../src/types/farcaster";

const getDeadline = () => {
  const now = Math.floor(Date.now() / 1000);
  const oneHour = 60 * 60;
  return BigInt(now + oneHour);
};

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
  imageUrl: string
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
              imageUrl
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
  imageUrl: string
) {
  try {
    const uuid = crypto.randomUUID();
    const response = await axios.put(
      "https://api.warpcast.com/v2/ext-send-direct-cast",
      {
        recipientFid: fid,
        message: `NEW CLANKER BY @${deployerUsername}\n\nhttps://farcaster.anky.bot/clanker/token/${tokenAddress}`,
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

export async function shareThisTokenOnClankerChannel(
  clanker_deployment_cast_hash: string,
  deployer_of_token_fid: string,
  token_address: string,
  maxRetries = 3,
  initialDelay = 1000,
  token_author_fid: number,
  text_of_deployment_cast: string
): Promise<string> {
  const random_uuid = crypto.randomUUID();
  // const cast_text = "hello world"
  // await askAnkyForCastText(
  //   token_author_fid,
  //   text_of_deployment_cast
  // );
  async function attemptReply(attempt = 1): Promise<string> {
    try {
      Logger.info(
        `Clankers cast is: ${clanker_deployment_cast_hash}. Anky is sharing it on /clanker. (attempt ${attempt}, from ${token_author_fid})`
      );

      let cleaned_cast_text = "";

      const options = {
        method: "POST",
        url: "https://api.neynar.com/v2/farcaster/cast",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-api-key": process.env.NEYNAR_API_KEY,
        },
        data: {
          channel_id: "clanker",
          text: cleaned_cast_text,
          signer_uuid: process.env.ANKY_SIGNER_UUID,
          idem: random_uuid,
          embeds: [
            {
              url: `https://farcaster.anky.bot/clanker/token/${token_address}`,
            },
          ],
        },
      };

      // const response = await axios.request(options);
      // const cast_hash = response.data.cast.hash;
      // Logger.info(
      //   `Successfully shared ${clanker_deployment_cast_hash} on /clanker, the cast hash of the cast from @anky.eth is: ${cast_hash}`
      // );
      return "";
      // return cast_hash;
    } catch (error) {
      if (attempt >= maxRetries) {
        Logger.error(`Failed to reply after ${maxRetries} attempts`, error);
        console.log("the error is", error);
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
