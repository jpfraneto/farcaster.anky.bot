import { createPublicClient, http, parseAbiItem } from "viem";
import { base } from "viem/chains";
import fs from "fs";
import path from "path";
import axios from "axios";
import { HackathonFinalist } from "src/routes/weeklyhackathon";
import final_week_1_votes from "./data/weeklyhackathon/final_week_1_votes.json";

console.log("Starting script execution...");

const WEEKLY_HACKATHON_WEEK_ONE_CONTRACT_ADDRESS =
  "0xb08806a1c22bf9c06dfa73296fb17a14d9cfc63b";
const RPC_URL = process.env.BASE_RPC_URL || "";
const BLOCK_TIMESTAMP = new Date("2025-01-19T06:33:00Z").getTime() / 1000; // Unix timestamp
const DEPLOYMENT_BLOCK = 25193187n;

console.log("Constants initialized:", {
  CONTRACT_ADDRESS: WEEKLY_HACKATHON_WEEK_ONE_CONTRACT_ADDRESS,
  RPC_URL,
  BLOCK_TIMESTAMP,
  DEPLOYMENT_BLOCK,
});

const getHoldersWithBalance = async () => {
  console.log("Starting getHoldersWithBalance function...");

  const CONTRACT_ADDRESS = "0xb08806a1c22bf9c06dfa73296fb17a14d9cfc63b";
  console.log("Initializing client with RPC URL:", RPC_URL);

  const client = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  console.log("Client initialized successfully");

  console.log("🔍 Fetching vote events...");

  // Create data directory if it doesn't exist
  const dataDir = path.join("data", "weeklyhackathon");
  console.log("Checking/creating data directory at:", dataDir);
  if (!fs.existsSync(dataDir)) {
    console.log("Data directory doesn't exist, creating it...");
    fs.mkdirSync(dataDir, { recursive: true });
    console.log("Data directory created successfully");
  }

  // Get all VoteEmitted events
  console.log("Querying VoteEmitted events from contract...");
  try {
    const voteEmittedEvent = parseAbiItem(
      "event VoteEmitted(address indexed voter, uint256 vote, string ipfsHash)"
    );

    const voteEvents = await client.getLogs({
      address: CONTRACT_ADDRESS,
      event: voteEmittedEvent,
      fromBlock: DEPLOYMENT_BLOCK,
    });

    console.log(`Found ${voteEvents.length} vote events`);

    console.log("Processing vote events...");
    const votes = await Promise.all(
      voteEvents.map(async (event, index) => {
        console.log(`Processing vote event ${index + 1}/${voteEvents.length}`);
        const block = await client.getBlock({
          blockNumber: event.blockNumber,
        });

        console.log(`Retrieved block data for event ${index + 1}:`, {
          blockNumber: block.number,
          timestamp: block.timestamp,
        });

        const voteData = {
          voter: event.args.voter,
          vote: event.args.vote.toString(),
          ipfsHash: event.args.ipfsHash,
          blockNumber: event.blockNumber,
          timestamp: block.timestamp,
          transactionHash: event.transactionHash,
        };

        console.log(`Vote data for event ${index + 1}:`, voteData);
        return voteData;
      })
    );

    const outputPath = path.join(dataDir, "voting-process.json");
    console.log("Saving votes to file:", outputPath);

    // Convert BigInt values to strings before JSON serialization
    const serializableVotes = votes.map((vote) => ({
      ...vote,
      blockNumber: Number(vote.blockNumber),
      timestamp: Number(vote.timestamp),
      vote: vote.vote.toString(),
    }));

    // Save votes to JSON file
    fs.writeFileSync(outputPath, JSON.stringify(serializableVotes, null, 2));

    console.log(
      `✅ Successfully saved ${votes.length} votes to voting-process.json`
    );
    return votes;
  } catch (error) {
    console.error("Error in contract event query:", error);
    console.error("Contract address:", CONTRACT_ADDRESS);
    throw error;
  }
};

const getFidsForVoters = async () => {
  console.log("Starting getFidsForVoters function...");

  try {
    // Read the voting-process.json file
    const dataDir = path.join("data", "weeklyhackathon");
    const votingDataPath = path.join(dataDir, "voting-process.json");
    const votingData = JSON.parse(fs.readFileSync(votingDataPath, "utf-8"));

    // Get unique voter addresses
    const voterAddresses = [...new Set(votingData.map((vote) => vote.voter))];
    console.log(`Found ${voterAddresses.length} unique voter addresses`);

    const voterFids = {};

    // Query Neynar API in chunks of 350 addresses to respect rate limits
    for (let i = 0; i < voterAddresses.length; i += 350) {
      const addressChunk = voterAddresses.slice(i, i + 350);
      const addresses = addressChunk.join("%2C");

      console.log(
        `Querying Neynar API for addresses ${i + 1} to ${
          i + addressChunk.length
        }`
      );

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

        // Process each address in the chunk
        addressChunk.forEach((address) => {
          const userArray = users[address.toLowerCase()];
          const user = userArray && userArray.length > 0 ? userArray[0] : null;

          voterFids[address] = {
            fid: user?.fid || "0",
            username: user?.username || "N/A",
          };
        });
      } catch (error) {
        console.error(`Error querying Neynar API for chunk ${i}:`, error);
      }

      // Add delay between chunks to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Save voter FIDs to JSON file
    const outputPath = path.join(dataDir, "voter-fids.json");
    fs.writeFileSync(outputPath, JSON.stringify(voterFids, null, 2));

    console.log("✅ Successfully saved voter FIDs to voter-fids.json");
    return voterFids;
  } catch (error) {
    console.error("Error in getFidsForVoters:", error);
    throw error;
  }
};

export const getHackathonVotes = async () => {
  try {
    const dataDir = path.join(process.cwd(), "data", "weeklyhackathon");

    // Read input files
    const holdersPath = path.join(dataDir, "farcaster_hackathon_holders.json");
    const voterFidsPath = path.join(dataDir, "voter-fids.json");
    const votingProcessPath = path.join(dataDir, "voting-process.json");

    const holders = JSON.parse(fs.readFileSync(holdersPath, "utf8"));
    const voterFids = JSON.parse(fs.readFileSync(voterFidsPath, "utf8"));
    const votingProcess = JSON.parse(
      fs.readFileSync(votingProcessPath, "utf8")
    );

    // Create mapping of address to vote info
    const votesByAddress = votingProcess.reduce((acc: any, vote: any) => {
      acc[vote.voter.toLowerCase()] = {
        vote: vote.vote,
        ipfsHash: vote.ipfsHash,
        blockNumber: vote.blockNumber,
        timestamp: vote.timestamp,
        transactionHash: vote.transactionHash,
      };
      return acc;
    }, {});

    // Create final output combining holder info with their vote
    const finalVotes: any = {};

    Object.entries(holders).forEach(([fid, holderInfo]: [string, any]) => {
      const address = holderInfo.address.toLowerCase();
      finalVotes[fid] = {
        ...holderInfo,
        vote: votesByAddress[address] || null,
      };
    });

    // Save to output file
    const outputPath = path.join(dataDir, "final_week_1_votes.json");
    fs.writeFileSync(outputPath, JSON.stringify(finalVotes, null, 2));

    console.log("✅ Successfully saved final votes to final_week_1_votes.json");
    return finalVotes;
  } catch (error) {
    console.error("Error in getHackathonVotes:", error);
    throw error;
  }
};

const initialVote = [1, 2, 3, 4, 5, 6, 7, 8];

const weekOneFinalists: HackathonFinalist[] = [
  {
    username: "jvaleska.eth",
    fid: 13505,
    pfp_url:
      "https://imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/f82ddc2b-1c48-4e8f-61b3-e40eb4d59700/original",
    display_name: "J. Valeska 🦊🎩🫂 ",
    project_url: "https://farcaster-frames-v2-demo.vercel.app",
    github_url: "https://github.com/jvaleskadevs/farcaster-frames-v2-demo",
    demo_url: "https://www.youtube.com/shorts/n6TVlqgExRo",
    id: 1,
  },
  {
    username: "hellno.eth",
    fid: 13596,
    pfp_url: "https://i.imgur.com/qoHFjQD.gif",
    display_name: "hellno the optimist",
    project_url: "https://farcasterframeception.vercel.app",
    github_url: "https://github.com/hellno/frameception",
    demo_url: "https://vimeo.com/1047553467/af29b86b8e?share=copy",
    id: 2,
  },
  {
    username: "cashlessman.eth",
    fid: 268438,
    pfp_url:
      "https://imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/a74b030e-2d92-405c-c2d0-1696f5d51d00/original",
    display_name: "cashlessman 🎩",
    project_url: "https://hackathon-bay-seven.vercel.app",
    github_url: "https://github.com/cashlessman/HACKATHON",
    demo_url: "https://youtube.com/shorts/6L9oX98xFmk",
    id: 3,
  },
  {
    username: "shomari.eth",
    fid: 870594,
    pfp_url:
      "https://imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/57f8600f-2e51-4549-8cc4-f80e4c681800/rectcrop3",
    display_name: "Shomari",
    project_url: "https://frameify.xyz",
    github_url: "https://github.com/castrguru/frameify",
    demo_url: "https://youtube.com/shorts/_ZWLzTZ0DGs",
    id: 4,
  },
  {
    username: "breck",
    fid: 158,
    pfp_url:
      "https://imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/bebf2f70-37fa-4114-9720-3bdc32f72a00/original",
    display_name: "Breck Yunits",
    project_url: "https://framehub.pro",
    github_url: "https://github.com/breck7/week-1",
    demo_url: "https://www.youtube.com/watch?v=3T6jUOJLWTw",
    id: 5,
  },
  {
    username: "dalresin",
    fid: 422333,
    pfp_url: "https://i.imgur.com/Gtrkty9.jpg",
    display_name: "Lord Dalresin🐝",
    project_url: "https://builder.dbee.be",
    github_url: "https://github.com/ysalitrynskyi/week-1",
    demo_url: "https://www.youtube.com/watch?v=7aRn3yEszIU",
    id: 6,
  },
  {
    username: "boredhead",
    fid: 6861,
    pfp_url: "https://i.imgur.com/P7utvMt.jpg",
    display_name: "kt 🤠",
    project_url: "https://next-frame-psi.vercel.app",
    github_url: "https://github.com/kirtirajsinh/framexperiment",
    demo_url: "https://youtu.be/bZfYeDcB2N8",
    id: 7,
  },
  {
    username: "itsmide.eth",
    fid: 262800,
    pfp_url: "https://i.imgur.com/96rdcWp.jpg",
    display_name: "mide (aka fraye)",
    project_url: "https://frames-v2.builders.garden",
    github_url: "https://github.com/builders-garden/frames-v2-showcase",
    demo_url: "https://www.youtube.com/watch?v=TXDSIAL1q_s",
    id: 8,
  },
];

const VOTE_WEIGHTS = [0.41, 0.24, 0.15, 0.09, 0.05, 0.03, 0.02, 0.01];

interface VoteData {
  vote: string;
  ipfsHash: string;
  blockNumber: number;
  timestamp: number;
  transactionHash: string;
}

interface Voter {
  address: string;
  balance: number;
  username: string;
  vote: {
    vote: string;
    ipfsHash: string;
    blockNumber: number;
    timestamp: number;
    transactionHash: string;
  } | null;
}

interface Results {
  [key: number]: number;
}

interface SortedResult {
  finalist: (typeof weekOneFinalists)[0];
  points: number;
}

// Initialize results object to track points per finalist
const results: Results = weekOneFinalists.reduce((acc: Results, finalist) => {
  acc[finalist.id] = 0;
  return acc;
}, {});

console.log("🎲 Starting vote calculation...");
console.log("🎭 Each voter's balance will be weighted across their 8 choices:");
VOTE_WEIGHTS.forEach((weight, i) => {
  console.log(`   ${i + 1}th place: ${weight * 100}% of voting power`);
});

// Process each voter's weighted votes
Object.values(final_week_1_votes as Record<string, Voter>).forEach((voter) => {
  if (voter.vote) {
    console.log(
      `\n🗳️  Processing votes from ${voter.username} (Balance: ${voter.balance})`
    );

    // Convert 8-digit vote string to array of finalist IDs
    const voteArray = voter.vote.vote.split("").map(Number);

    // Distribute voter's balance according to weights
    voteArray.forEach((finalistId: number, position: number) => {
      const weightedVote = voter.balance * VOTE_WEIGHTS[position];
      results[finalistId] += weightedVote;

      console.log(
        `   ${
          position + 1
        }. ${weightedVote.toLocaleString()} points to finalist #${finalistId}`
      );
    });
  }
});

// Sort results to find winner
const sortedResults: SortedResult[] = Object.entries(results)
  .sort(([, a], [, b]) => (b as number) - (a as number))
  .map(([id, points]) => ({
    finalist: weekOneFinalists.find((f) => f.id === Number(id))!,
    points: points as number,
  }));

console.log("\n🥁 Final Results 🥁");
console.log("=====================================");

// Dramatic reveal
setTimeout(() => {
  console.log("\n🥉 Third Place...");
  setTimeout(() => {
    console.log(
      `${sortedResults[2].finalist.display_name} with ${Math.round(
        sortedResults[2].points
      ).toLocaleString()} points!`
    );
    setTimeout(() => {
      console.log("\n🥈 Second Place...");
      setTimeout(() => {
        console.log(
          `${sortedResults[1].finalist.display_name} with ${Math.round(
            sortedResults[1].points
          ).toLocaleString()} points!`
        );
        setTimeout(() => {
          console.log("\n🥇 And the WINNER of Week 1 is...");
          setTimeout(() => {
            console.log(`🎉 ${sortedResults[0].finalist.display_name} 🎉`);
            console.log(
              `with an incredible ${Math.round(
                sortedResults[0].points
              ).toLocaleString()} points!`
            );
            console.log("\n👏 Congratulations to all participants! 🚀");
          }, 1000);
        }, 2000);
      }, 1000);
    }, 2000);
  }, 1000);
}, 1000);
