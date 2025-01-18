import { ethers, Contract, JsonRpcProvider, Log, EventLog } from "ethers";
import abi from "./src/routes/weeklyhackathon/clanker_v2_abi.json"; // Import the ABI from a separate file
import fs from "fs";
import path from "path";
import axios from "axios";

const CONTRACT_ADDRESS = "0x3dF58A5737130FdC180D360dDd3EFBa34e5801cb";
const RPC_URL = process.env.BASE_RPC_URL || "";
const BLOCK_TIMESTAMP = new Date("2025-01-16T23:59:00Z").getTime() / 1000; // Unix timestamp
const MIN_BALANCE = ethers.parseUnits("88888", 18); // Adjust token decimals if needed
const DEPLOYMENT_BLOCK = 24838960;
let BLOCK_CHUNK_SIZE = 2000; // Maximum block range size for eth_getLogs

const getHoldersWithBalance = async () => {
  console.log("🚀 Starting to fetch holders of $hackathon...");
  console.log("📝 Using contract address:", CONTRACT_ADDRESS);
  console.log(
    "🕒 Target timestamp:",
    new Date(BLOCK_TIMESTAMP * 1000).toISOString()
  );
  console.log("💰 Minimum balance:", ethers.formatUnits(MIN_BALANCE, 18));
  console.log("🏗️ Deployment block:", DEPLOYMENT_BLOCK);

  if (!RPC_URL) {
    console.error("❌ BASE_RPC_URL is not set in the environment variables.");
    return;
  }

  console.log("🔗 Connecting to RPC URL...");
  const provider = new JsonRpcProvider(RPC_URL);
  const contract = new Contract(CONTRACT_ADDRESS, abi, provider);
  console.log("🔌 Connected to provider and contract");

  // Get the block number closest to the target timestamp
  console.log("📊 Fetching current block number...");
  const block = await provider.getBlockNumber();
  let targetBlock = block;
  console.log(`📦 Current block number: ${block}`);

  console.log("🔍 Searching for target block...");
  let low = DEPLOYMENT_BLOCK;
  let high = block;

  while (low <= high) {
    const mid = Math.floor(low + (high - low) / 2);
    const blockInfo = await provider.getBlock(mid);

    if (!blockInfo) {
      console.error("❌ Failed to fetch block information");
      return;
    }

    console.log(
      `⏳ Checking block ${mid}, timestamp: ${new Date(
        blockInfo.timestamp * 1000
      ).toISOString()}`
    );

    if (blockInfo.timestamp === BLOCK_TIMESTAMP) {
      targetBlock = mid;
      break;
    } else if (blockInfo.timestamp < BLOCK_TIMESTAMP) {
      low = mid + 1;
    } else {
      high = mid - 1;
      targetBlock = mid; // Keep track of the closest block that's still before our target time
    }
  }

  console.log(`🎯 Found target block: ${targetBlock}`);

  // Create log file stream
  console.log("📁 Creating log file...");
  const logStream = fs.createWriteStream(
    path.join("data", "hackathon_transfers.txt"),
    { flags: "a" }
  );
  logStream.write(
    `=== Transfer Events Log (${new Date().toISOString()}) ===\n`
  );

  // Fetch transfer events in chunks to avoid RPC limits
  console.log("📥 Fetching transfer events in chunks...");
  const balances: { [address: string]: bigint } = {};
  let processedCount = 0;

  for (
    let fromBlock = DEPLOYMENT_BLOCK;
    fromBlock < targetBlock;
    fromBlock += BLOCK_CHUNK_SIZE
  ) {
    const toBlock = Math.min(fromBlock + BLOCK_CHUNK_SIZE - 1, targetBlock);
    console.log(`📊 Scanning blocks ${fromBlock} to ${toBlock}`);

    try {
      const transferEvents = await contract.queryFilter(
        "Transfer",
        fromBlock,
        toBlock
      );

      transferEvents.forEach((event: Log | EventLog) => {
        if (!("args" in event) || !event.args) return;
        const { from, to, value } = event.args;
        const amount = BigInt(value.toString());

        // Log transfer to file
        logStream.write(
          `From: ${from}\nTo: ${to}\nAmount: ${ethers.formatUnits(
            amount,
            18
          )}\n---\n`
        );

        if (from !== ethers.ZeroAddress) {
          balances[from] = (balances[from] || BigInt(0)) - amount;
        }

        if (to !== ethers.ZeroAddress) {
          balances[to] = (balances[to] || BigInt(0)) + amount;
        }

        processedCount++;
        if (processedCount % 1000 === 0) {
          console.log(`📊 Processed ${processedCount} transfers...`);
        }
      });
    } catch (error) {
      console.error(
        `❌ Error fetching events for blocks ${fromBlock}-${toBlock}:`,
        error
      );
      // Reduce chunk size and retry
      BLOCK_CHUNK_SIZE = Math.floor(BLOCK_CHUNK_SIZE / 2);
      fromBlock -= BLOCK_CHUNK_SIZE; // Go back to retry with smaller chunk
      continue;
    }
  }

  logStream.end();
  console.log("📝 Transfer events logged to data/hackathon_transfers.txt");

  // Filter holders with balances above the minimum
  console.log("🔍 Filtering holders with minimum balance...");
  const holdersWithBalances = Object.entries(balances)
    .filter(([_, balance]) => balance >= MIN_BALANCE)
    .map(([address, balance]) => ({ address, balance }));

  // Save holders to file
  fs.writeFileSync(
    path.join("data", "hackathon_holders.txt"),
    holdersWithBalances.map((h) => h.address).join(",")
  );

  // Query Neynar API in chunks of 350 addresses
  console.log("🔍 Querying Neynar API for holder information...");
  const holderInfoStream = fs.createWriteStream(
    path.join("data", "hackathon_holders_info.txt")
  );
  const farcasterHolderStream = fs.createWriteStream(
    path.join("data", "farcaster_hackathon_holders.txt")
  );

  // Create object to store holders by FID
  const holdersByFid: {
    [fid: string]: { address: string; balance: number; username: string };
  } = {};

  // Write headers
  holderInfoStream.write(
    "$HACKATHON----WEEK-1------VOTERS-SNAPSHOT-----$HACKATHON\n"
  );
  holderInfoStream.write("MAKECRYPTOCYPHERPUNKAGAIN\n");
  farcasterHolderStream.write(
    "$HACKATHON----WEEK-1------VOTERS-SNAPSHOT-----$HACKATHON\n"
  );
  farcasterHolderStream.write("MAKECRYPTOCYPHERPUNKAGAIN\n");

  // Sort holders by balance in descending order
  const sortedHolders = holdersWithBalances.sort((a, b) =>
    b.balance > a.balance ? 1 : -1
  );

  for (let i = 0; i < sortedHolders.length; i += 350) {
    const chunk = sortedHolders.slice(i, i + 350);
    const addresses = chunk.map((h) => h.address).join("%2C");

    try {
      const response = await axios.request({
        method: "GET",
        url: `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${addresses}`,
        headers: {
          accept: "application/json",
          "x-neynar-experimental": "false",
          "x-api-key": process.env.NEYNAR_API_KEY || "NEYNAR_API_DOCS",
        },
      });

      const users = response.data;

      // Write holder info to files
      chunk.forEach((holder) => {
        const userArray = users[holder.address.toLowerCase()];
        const user = userArray && userArray.length > 0 ? userArray[0] : null;
        const formattedBalance = Math.floor(
          Number(ethers.formatUnits(holder.balance, 18))
        );
        const line = `${holder.address} ${formattedBalance} ${
          user?.fid || "0"
        } ${user?.username || "N/A"}\n`;

        // Write to main holders file
        holderInfoStream.write(line);

        // Write to Farcaster holders file only if user has FID
        if (user?.fid && user.fid !== "0") {
          farcasterHolderStream.write(line);
          // Add to holdersByFid object
          holdersByFid[user.fid] = {
            address: holder.address,
            balance: formattedBalance,
            username: user.username || "N/A",
          };
        }
      });
    } catch (error) {
      console.error(`Error querying Neynar API for chunk ${i}:`, error);
    }

    // Add delay between chunks to respect rate limits
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  holderInfoStream.end();
  farcasterHolderStream.end();

  // Save holders by FID to JSON file
  fs.writeFileSync(
    path.join("data", "farcaster_hackathon_holders.json"),
    JSON.stringify(holdersByFid, null, 2)
  );

  console.log("✅ Process completed successfully");
  return holdersWithBalances;
};

getHoldersWithBalance().catch((error) => {
  console.error("💥 Error:", error);
  console.error("Error details:", error.message);
  if (error.stack) {
    console.error("Stack trace:", error.stack);
  }
});
