import { NeynarAPIClient } from "@neynar/nodejs-sdk";

const client = new NeynarAPIClient(process.env.NEYNAR_API_KEY as string);

export async function getUserBalance(fid: number) {
  const getUsersMainAddress = await getUserMainAddress(fid);
  console.log("fetching the balance of user ", fid);
  return { eth: 0.001, usd: 200 };
}

export async function getUserMainAddress(fid: number) {}

export async function isUserFollowedByUser(fid: number, deployerFid: number) {
  try {
    const fetchAllFollowers = async (fid: number) => {
      let cursor: string | null = "";
      let users: unknown[] = [];

      do {
        const result = await client.fetchUserFollowers(fid, {
          limit: 150,
          cursor,
        });
        users = users.concat(result.result.users);
        cursor = result.result.next.cursor;
      } while (cursor !== "" && cursor !== null);

      return users;
    };

    const followers = await fetchAllFollowers(fid);
    return followers.some((follower) => (follower as any).fid === deployerFid);
  } catch (error) {
    return false;
  }
}
