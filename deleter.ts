import axios from "axios";

// Environment variables
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const WEEKLY_HACKATHON_SIGNER_UUID = process.env.WEEKLY_HACKATHON_SIGNER_UUID;

if (!NEYNAR_API_KEY || !WEEKLY_HACKATHON_SIGNER_UUID) {
  throw new Error("Missing required environment variables");
}

// Function to fetch all casts for a given FID
async function fetchCasts(fid: number, cursor?: string): Promise<any[]> {
  try {
    const options = {
      method: "GET",
      url: `https://api.neynar.com/v2/farcaster/feed/user/casts`,
      params: {
        fid: fid,
        limit: 150,
        cursor: cursor,
        include_replies: true,
      },
      headers: {
        accept: "application/json",
        "x-api-key": NEYNAR_API_KEY,
      },
    };

    const response = await axios.request(options);
    const casts = response.data.casts || [];
    const nextCursor = response.data.next?.cursor;

    // Recursively fetch next page if cursor exists
    if (nextCursor) {
      const nextCasts = await fetchCasts(fid, nextCursor);
      return [...casts, ...nextCasts];
    }

    return casts;
  } catch (error) {
    console.error("Error fetching casts:", error);
    return [];
  }
}

// Function to delete a single cast
async function deleteCast(targetHash: string): Promise<boolean> {
  try {
    const options = {
      method: "DELETE",
      url: "https://api.neynar.com/v2/farcaster/cast",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": NEYNAR_API_KEY,
      },
      data: {
        target_hash: targetHash,
        signer_uuid: WEEKLY_HACKATHON_SIGNER_UUID,
      },
    };

    await axios.request(options);
    return true;
  } catch (error) {
    console.error(`Error deleting cast ${targetHash}:`, error);
    return false;
  }
}

// Main function to delete all casts
export async function deleteAllCasts() {
  try {
    // Fetch all casts for FID 641762
    const allCasts = await fetchCasts(641762);
    console.log(`Found ${allCasts.length} casts to delete`);

    // Delete each cast
    let successCount = 0;
    for (const cast of allCasts) {
      const success = await deleteCast(cast.hash);
      if (success) {
        successCount++;
        console.log(`Successfully deleted cast ${cast.hash}`);
      }
      // Add small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log(
      `Deletion complete. Successfully deleted ${successCount}/${allCasts.length} casts`
    );
  } catch (error) {
    console.error("Error in deletion process:", error);
  }
}

deleteAllCasts();
