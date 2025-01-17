import { ethers, Contract, JsonRpcProvider, Log, EventLog } from "ethers";
import abi from "./src/routes/weeklyhackathon/clanker_v2_abi.json"; // Import the ABI from a separate file
import fs from "fs";
import path from "path";

const CONTRACT_ADDRESS = "0x3dF58A5737130FdC180D360dDd3EFBa34e5801cb";
const RPC_URL = process.env.BASE_RPC_URL || "";
const BLOCK_TIMESTAMP = new Date("2025-01-16T23:59:00Z").getTime() / 1000; // Unix timestamp
const MIN_BALANCE = ethers.parseUnits("88888", 18); // Adjust token decimals if needed
const DEPLOYMENT_BLOCK = 24838960;

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
  let searchCount = 0;
  while (true) {
    const blockInfo = await provider.getBlock(targetBlock);
    if (!blockInfo) {
      console.error("❌ Failed to fetch block information");
      return;
    }
    console.log(
      `⏳ Checking block ${targetBlock}, timestamp: ${new Date(
        blockInfo.timestamp * 1000
      ).toISOString()}`
    );
    if (blockInfo.timestamp <= BLOCK_TIMESTAMP) break;
    targetBlock--;
    searchCount++;
    if (searchCount % 100 === 0) {
      console.log(`🔄 Searched ${searchCount} blocks so far...`);
    }
  }

  console.log(`🎯 Found target block: ${targetBlock}`);

  // Fetch all Transfer events from the contract starting from deployment block
  console.log("📥 Fetching transfer events...");
  console.log(`📊 Scanning from block ${DEPLOYMENT_BLOCK} to ${targetBlock}`);
  const transferEvents = await contract.queryFilter(
    "Transfer",
    DEPLOYMENT_BLOCK,
    targetBlock
  );
  console.log(`✨ Found ${transferEvents.length} transfer events`);

  // Create log file stream
  console.log("📁 Creating log file...");
  const logStream = fs.createWriteStream(
    path.join("data", "hackathon_transfers.txt"),
    { flags: "a" }
  );
  logStream.write(
    `=== Transfer Events Log (${new Date().toISOString()}) ===\n`
  );

  // Track balances by iterating over Transfer events
  console.log("💹 Processing transfer events...");
  const balances: { [address: string]: bigint } = {};
  let processedCount = 0;

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
      console.log(
        `📊 Processed ${processedCount}/${transferEvents.length} transfers...`
      );
    }
  });

  logStream.end();
  console.log("📝 Transfer events logged to data/hackathon_transfers.txt");

  // Filter holders with balances above the minimum
  console.log("🔍 Filtering holders with minimum balance...");
  const holders = Object.entries(balances)
    .filter(([_, balance]) => balance >= MIN_BALANCE)
    .map(([address]) => address);

  console.log(
    `🏆 Found ${holders.length} holders with more than 88888 tokens:`,
    holders
  );
  console.log("✅ Process completed successfully");
  return holders;
};

getHoldersWithBalance().catch((error) => {
  console.error("💥 Error:", error);
  console.error("Error details:", error.message);
  if (error.stack) {
    console.error("Stack trace:", error.stack);
  }
});
