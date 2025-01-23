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

export async function getUserByFid(fid: number) {
  const options = {
    method: "GET",
    url: `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
    headers: {
      accept: "application/json",
      "x-neynar-experimental": "false",
      "x-api-key": process.env.NEYNAR_API_KEY,
    },
  };

  const response = await axios.request(options);
  return response.data.users[0];
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

export async function sendHackathonDC(fid: number) {
  try {
    console.log("sending hackathon dc to", fid);
    const uuid = crypto.randomUUID();
    const response = await axios.put(
      "https://api.warpcast.com/v2/ext-send-direct-cast",
      {
        recipientFid: fid,
        message: `hey hey. since you held more of 88888 $hackathon at the end of week 1, you are eligible to vote for this week's winner. \n\nif you want to do so, please go to this cast and open the frame. arrange your winners and then cast your vote (you will mint an nft with it!)\n\nthis message was automated (there are 127 eligible voters, so if i crossed a boundary by sending this DC, im sorry. just ignore it. thank you for your support and partipation)\n\nhttps://warpcast.com/jpfraneto.eth/0xc30851ba`,
        idempotencyKey: uuid,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.JPFRANETO_WARPCAST_API_KEY}`,
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

export async function castClanker(
  token_address: string,
  cast_text: string,
  maxRetries = 3,
  initialDelay = 1000
): Promise<string> {
  const random_uuid = crypto.randomUUID();

  async function attemptCast(attempt = 1): Promise<string> {
    try {
      Logger.info(
        `Casting clanker for token ${token_address} (attempt ${attempt})`
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
          channel_id: "clanker",
          text: cast_text,
          signer_uuid: process.env.ANKY_SIGNER_UUID,
          idem: random_uuid,
          embeds: [
            {
              url: `https://farcaster.anky.bot/clanker/token/${token_address}`,
            },
          ],
        },
      };

      const response = await axios.request(options);
      const cast_hash = response.data.cast.hash;
      Logger.info(
        `Successfully cast clanker for token ${token_address}, cast hash: ${cast_hash}`
      );
      return cast_hash;
    } catch (error) {
      if (attempt >= maxRetries) {
        Logger.error(`Failed to cast after ${maxRetries} attempts`, error);
        console.log("the error is", error);
        throw error;
      }

      const delay = initialDelay * Math.pow(2, attempt - 1);
      Logger.info(`Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return attemptCast(attempt + 1);
    }
  }

  try {
    return await attemptCast();
  } catch (error) {
    Logger.error("Error casting clanker", error);
    throw error;
  }
}
export async function castClankerWithTokenInfo(
  ticker: string,
  token_name: string,
  initialDelay = 1000,
  description: string,
  image_url: string,
  encoded_metadata_ipfs_hash: string,
  writerFid: number
): Promise<string> {
  const random_uuid = crypto.randomUUID();

  async function attemptReply(attempt = 1): Promise<string> {
    try {
      console.log("deploying token", ticker, token_name, description);
      const cast_text = `@clanker deploy $${ticker.replace(
        " ",
        "_"
      )}: "${token_name.toLowerCase()}":\n\n${encoded_metadata_ipfs_hash}`;

      const options = {
        method: "POST",
        url: "https://api.neynar.com/v2/farcaster/cast",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-api-key": process.env.NEYNAR_API_KEY,
        },
        data: {
          channel_id: "anky",
          text: cast_text,
          signer_uuid: process.env.ANKY_SIGNER_UUID,
          idem: random_uuid,
          embeds: [
            {
              url: image_url,
            },
          ],
        },
      };

      const response = await axios.request(options);

      const cast_hash = response.data.cast.hash;

      const uuid = crypto.randomUUID();

      await axios.put(
        "https://api.warpcast.com/v2/ext-send-direct-cast",
        {
          recipientFid: writerFid,
          message: `congrats, your anky clanker was deployed\n\nhttps://warpcast.com/~/conversations/${cast_hash}`,
          idempotencyKey: uuid,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.ANKY_WARPCAST_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      Logger.info(`DC notification sent to ${writerFid}`);
      Logger.info(`Successfully casted ${cast_hash} on /anky`);
      return cast_hash;
    } catch (error) {
      console.log("the error is", error);
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
  const cast_text = await askAnkyForCastText(
    token_author_fid,
    text_of_deployment_cast
  );
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
          text: cast_text,
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

export async function fetchAllAnkyCastsAndDeleteThem() {
  try {
    console.log("Fetching all casts for FID 18350...");
    const casts = await fetchAllCastsByUser(18350, 150, true);
    console.log(`Found ${casts?.length || 0} casts to process`);

    if (!casts) {
      console.log("No casts found, exiting early");
      return;
    }

    for (const cast of casts) {
      const options = {
        method: "DELETE",
        url: "https://api.neynar.com/v2/farcaster/cast",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-api-key": process.env.NEYNAR_API_KEY,
        },
        data: {
          target_hash: cast.hash,
          signer_uuid: process.env.ANKY_SIGNER_UUID,
        },
      };

      try {
        await axios.request(options);
        Logger.info(`Successfully deleted cast with hash ${cast.hash}`);
      } catch (err) {
        console.error(`Error deleting cast ${cast.hash}:`, err);
        Logger.error(`Failed to delete cast with hash ${cast.hash}`, err);
      }
    }
    console.log("Finished processing all casts");
  } catch (error) {
    console.error("Error in fetchAllAnkyCastsAndDeleteThem:", error);
    Logger.error("Error fetching all Anky casts", error);
    throw error;
  }
}

export async function fetchAllCastsByUser(
  fid: number,
  limit = 150,
  include_replies = true
) {
  const options = {
    method: "GET",
    url: `https://api.neynar.com/v2/farcaster/feed/user/casts?fid=${fid}&limit=${limit}&include_replies=${include_replies}`,
    headers: {
      accept: "application/json",
      "x-api-key": process.env.NEYNAR_API_KEY,
    },
  };

  const response = await axios.request(options);
  return response.data.casts;
}

export async function countNumberOfFids(return_fids = false) {
  try {
    const filePath = path.join(process.cwd(), "data/created_fids.txt");

    // Create directory if it doesn't exist
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Create file with empty array if it doesn't exist
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify([]));
      return { count: 0, fids: [] };
    }

    // Read and parse file contents
    const fileContent = fs.readFileSync(filePath, "utf8");
    const fids = fileContent.trim() ? JSON.parse(fileContent) : [];

    // Return count and optionally the fids array
    if (return_fids) {
      return { fids, number_of_fids: fids.length };
    } else {
      return { fids: [], number_of_fids: fids.length };
    }
  } catch (error) {
    console.error("Error counting FIDs:", error);
    Logger.error("Error counting FIDs", error);
    throw error;
  }
}

export async function getAnkyFeed() {
  const feed = await fetchAllCastsByUser(18350, 88, false);
  return feed;
}
