import fs from "fs";
import path from "path";

interface HackathonHolder {
  wallets: string[];
  balance: number;
  username: string;
}

interface HackathonHolders {
  [fid: string]: HackathonHolder;
}

// Read the input file
const inputFile = fs.readFileSync("farcaster_hackathon_holders.txt", "utf-8");
const lines = inputFile.trim().split("\n");

// Process the data
const holders: HackathonHolders = {};

lines.forEach((line) => {
  const [wallet, balance, fid, username] = line.trim().split(" ");

  if (!holders[fid]) {
    holders[fid] = {
      wallets: [wallet],
      balance: Number(balance),
      username: username,
    };
  } else {
    // Add wallet and sum balance if FID already exists
    holders[fid].wallets.push(wallet);
    holders[fid].balance += Number(balance);
  }
});

// Write to output file
const outputPath = path.join("data", "hackathonSnapshot.json");
fs.writeFileSync(outputPath, JSON.stringify(holders, null, 2));
