import { NeynarAPIClient } from "@neynar/nodejs-sdk";
import { Logger } from "../../../utils/Logger";

const client = new NeynarAPIClient(process.env.NEYNAR_API_KEY as string);

export async function getUserBalance(fid: number) {
  const getUsersMainAddress = await getUserMainAddress(fid);
  console.log("fetching the balance of user ", fid);
  return { eth: 0.001, usd: 200 };
}

export async function getUserMainAddress(fid: number) {}

export async function isUserFollowedByUser(fid: number, deployerFid: number) {
  try {
    Logger.info(`Checking if user ${deployerFid} is followed by user ${fid}`);

    const fetchAllFollowers = async (fid: number) => {
      let cursor: string | null = "";
      let users: unknown[] = [];

      do {
        Logger.info(`Fetching followers for FID ${fid} with cursor ${cursor}`);
        const result = await client.fetchUserFollowers(fid, {
          limit: 150,
          cursor,
        });
        users = users.concat(result.result.users);
        cursor = result.result.next.cursor;
        Logger.info(
          `Fetched ${result.result.users.length} followers, next cursor: ${cursor}`
        );
      } while (cursor !== "" && cursor !== null);

      Logger.info(`Total followers fetched for FID ${fid}: ${users.length}`);
      return users;
    };

    const followers = await fetchAllFollowers(fid);
    const isFollowed = followers.some(
      (follower) => (follower as any).fid === deployerFid
    );
    Logger.info(
      `User ${deployerFid} ${
        isFollowed ? "is" : "is not"
      } followed by user ${fid}`
    );
    return isFollowed;
  } catch (error) {
    Logger.error(
      `Error checking if user ${deployerFid} is followed by ${fid}: ${error}`
    );
    return false;
  }
}
