import { Button, Frog, parseEther, TextInput } from "frog";
import { Logger } from "../../../utils/Logger";
import { getUserBalance } from "./functions.js";
import fs from "node:fs";
import path from "node:path";
import { Token } from "../../types/clanker";
import { getTokenInformationFromLocalStorage } from "../../storage";

const imageOptions = {
  width: 600,
  height: 600,
  fonts: [
    {
      name: "Poetsen One",
      source: "google",
    },
    {
      name: "Roboto",
      source: "google",
    },
  ] as any,
};

export const clankerFrame = new Frog({
  title: "Anky Clanker",
});

clankerFrame.use(async (c, next) => {
  Logger.info(`[${c.req.method}] : : :  ${c.req.url}`);
  c.res.headers.set("Cache-Control", "max-age=0");
  await next();
});

clankerFrame.frame("/", async (c) => {
  return c.res({
    title: "clanker notifications",
    image: "https://github.com/jpfraneto/images/blob/main/clanker.jpg?raw=true",
    intents: [
      <Button action="/unsubscribe">unsubscribe</Button>,
      <Button action="/get-notified">get notified</Button>,
    ],
  });
});

clankerFrame.frame("/token/:token_address", async (c) => {
  try {
    const token_address = c.req.param("token_address");
    console.log("THE TOKEN ADDRESS IS", token_address);
    const tokenInformation = await getTokenInformationFromLocalStorage(
      token_address
    );
    console.log("THE TOKEN INFORMATION IS", tokenInformation);
    const { deployment_cast_hash, image_url } = tokenInformation;
    const parsedImageUrl = decodeURIComponent(image_url as string);
    return c.res({
      title: "clanker token",
      image: parsedImageUrl,
      intents: [
        <Button.Link href={`https://dexscreener.com/base/${token_address}`}>
          dexscreener
        </Button.Link>,
        <Button.Link href={`https://uniswap.org/${token_address}`}>
          uniswap
        </Button.Link>,
        <Button.Link href={`https://clanker.xyz/`}>clanker</Button.Link>,
        <Button.Link
          href={`https://warpcast.com/clanker/${deployment_cast_hash}`}
        >
          warpcast
        </Button.Link>,
      ],
    });
  } catch (error) {
    return frameError(error, c, new Date().getTime());
  }
});

function frameError(error: any, c: any, timestamp: number) {
  return c.res({
    title: "error",
    image: (
      <div tw="flex h-full w-full flex-col px-8 items-left py-4 justify-center bg-[#1E1B2E] text-white">
        <span tw="text-[#8B7FD4] text-8xl mb-2 font-bold">error</span>
        <span tw="text-[#A5A1D3] text-4xl mb-2">{error.message}</span>
      </div>
    ),
  });
}

const addUserToNotificationList = async (fid: number) => {
  // Read existing FIDs from file
  const notificationsFilePath = path.join(
    process.cwd(),
    "notification-fids.json"
  );

  try {
    // Create directory if it doesn't exist
    const dir = path.dirname(notificationsFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Create file if it doesn't exist
    if (!fs.existsSync(notificationsFilePath)) {
      fs.writeFileSync(notificationsFilePath, JSON.stringify([]));
    }

    // Read current FIDs
    const currentFids = JSON.parse(
      fs.readFileSync(notificationsFilePath, "utf8")
    );

    // Add new FID if not already present
    if (!currentFids.includes(fid)) {
      currentFids.push(fid);
      // Write updated array back to file
      fs.writeFileSync(
        notificationsFilePath,
        JSON.stringify(currentFids, null, 2)
      );
    }

    console.log(`User ${fid} added to notifications list`);
  } catch (error) {
    console.error("Error managing notifications list:", error);
    throw error;
  }
  return true;
};

const removeUserFromNotificationList = async (fid: number) => {
  // Read existing FIDs from file
  const notificationsFilePath = path.join(
    process.cwd(),
    "notification-fids.json"
  );

  try {
    // Check if file exists
    if (!fs.existsSync(notificationsFilePath)) {
      console.log("Notifications file does not exist");
      return false;
    }

    // Read current FIDs
    const currentFids = JSON.parse(
      fs.readFileSync(notificationsFilePath, "utf8")
    );

    // Remove FID if present
    const index = currentFids.indexOf(fid);
    if (index > -1) {
      currentFids.splice(index, 1);
      // Write updated array back to file
      fs.writeFileSync(
        notificationsFilePath,
        JSON.stringify(currentFids, null, 2)
      );
      console.log(`User ${fid} removed from notifications list`);
      return true;
    }

    console.log(`User ${fid} not found in notifications list`);
    return false;
  } catch (error) {
    console.error("Error managing notifications list:", error);
    throw error;
  }
};

clankerFrame.frame("/unsubscribe", async (c) => {
  const userFid = c.frameData?.fid;
  await removeUserFromNotificationList(userFid!);
  return c.res({
    title: "unsubscribed",
    image: (
      <div tw="flex h-full w-full flex-col px-8 items-left py-4 justify-center bg-black text-white">
        <span tw="text-purple-500 text-6xl mb-2">unsubscribed</span>
      </div>
    ),
    intents: [<Button action="/get-notified">subscribe</Button>],
  });
});

clankerFrame.frame("/get-notified", async (c) => {
  try {
    const userFid = c.frameData?.fid;
    await addUserToNotificationList(userFid!);
    console.log("done");
    return c.res({
      title: "get notified",
      image: (
        <div tw="flex h-full w-full flex-col px-8 items-left py-4 justify-center bg-black text-white">
          <span tw="text-purple-500 text-6xl mb-2">subscribed</span>
        </div>
      ),
      intents: [<Button action="/unsubscribe">unsubscribe</Button>],
    });
  } catch (error) {
    console.log("error", error);
    return c.res({
      title: "get notified",
      image: (
        <div tw="flex h-full w-full flex-col px-8 items-left py-4 justify-center bg-black text-white">
          <span tw="text-purple-500 text-6xl mb-2">There was an error</span>
          <span tw="text-purple-500 text-4xl mb-2">Please try again</span>
        </div>
      ),
    });
  }
});

clankerFrame.frame("/eth-balance/:tokenAddress", async (c) => {
  const userFid = c.frameData?.fid;
  const userEthBalanceOnBase = await getUserBalance(userFid!);
  const tokenAddress = c.req.param("tokenAddress");
  console.log("IN HERE", userEthBalanceOnBase);
  return c.res({
    title: "vibra.so",
    image: (
      <div tw="flex h-full w-full flex-col px-8 items-left py-4 justify-center bg-black text-white">
        <span tw="text-purple-500 text-6xl mb-2">
          Your eth balance on base is:
        </span>
        <span tw="text-purple-500 text-6xl mb-2">
          {userEthBalanceOnBase.eth}
        </span>
        <span tw="text-purple-500 text-6xl mb-2">The equivalent in USD is</span>
        <span tw="text-purple-500 text-6xl mb-2">
          {userEthBalanceOnBase.usd}
        </span>
      </div>
    ),
    intents: [
      <TextInput placeholder="enter eth amount" />,
      <Button.Transaction target={`/ape-token/${tokenAddress}`}>
        Ape
      </Button.Transaction>,
    ],
  });
});

clankerFrame.frame("/:tokenAddress", async (c) => {
  const tokenAddress = c.req.param("tokenAddress");
  console.log("the token address is: ", tokenAddress);

  return c.res({
    title: "vibra.so",
    image: (
      <div tw="flex h-full w-full flex-col px-8 items-left py-4 justify-center bg-black text-white">
        <span tw="text-purple-500 text-8xl mb-2">APE THIS TOKEN</span>
        <span tw="text-purple-500 text-5xl mb-2">{tokenAddress}</span>
      </div>
    ),
    intents: [
      <TextInput placeholder="enter eth amount" />,
      <Button action={`/eth-balance/${tokenAddress}`}>My Eth Balance</Button>,
      <Button.Transaction target={`/ape-token/${tokenAddress}`}>
        Ape
      </Button.Transaction>,
    ],
  });
});

const UNISWAP_UNIVERSAL_ROUTER_ADDRESS =
  "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD";

clankerFrame.transaction("/ape-token/:tokenAddress", async (c) => {
  const { inputText } = c;

  // Validate input is a valid ETH amount
  const ethAmount = parseFloat(inputText!);
  if (isNaN(ethAmount) || ethAmount <= 0) {
    throw new Error("Invalid ETH amount");
  }

  // Convert ETH amount to Wei (bigint)
  const weiAmount = BigInt(Math.floor(ethAmount * 1e18));

  console.log("Aping with", ethAmount, "ETH (", weiAmount, "wei)");

  return c.contract({
    chainId: "eip155:8453",
    functionName: "execute",
    abi: UNISWAP_ABI,
    to: UNISWAP_UNIVERSAL_ROUTER_ADDRESS,
    args: [weiAmount],
  });
});

const UNISWAP_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "permit2", type: "address" },
          { internalType: "address", name: "weth9", type: "address" },
          { internalType: "address", name: "seaportV1_5", type: "address" },
          { internalType: "address", name: "seaportV1_4", type: "address" },
          { internalType: "address", name: "openseaConduit", type: "address" },
          { internalType: "address", name: "nftxZap", type: "address" },
          { internalType: "address", name: "x2y2", type: "address" },
          { internalType: "address", name: "foundation", type: "address" },
          { internalType: "address", name: "sudoswap", type: "address" },
          { internalType: "address", name: "elementMarket", type: "address" },
          { internalType: "address", name: "nft20Zap", type: "address" },
          { internalType: "address", name: "cryptopunks", type: "address" },
          { internalType: "address", name: "looksRareV2", type: "address" },
          {
            internalType: "address",
            name: "routerRewardsDistributor",
            type: "address",
          },
          {
            internalType: "address",
            name: "looksRareRewardsDistributor",
            type: "address",
          },
          { internalType: "address", name: "looksRareToken", type: "address" },
          { internalType: "address", name: "v2Factory", type: "address" },
          { internalType: "address", name: "v3Factory", type: "address" },
          {
            internalType: "bytes32",
            name: "pairInitCodeHash",
            type: "bytes32",
          },
          {
            internalType: "bytes32",
            name: "poolInitCodeHash",
            type: "bytes32",
          },
        ],
        internalType: "struct RouterParameters",
        name: "params",
        type: "tuple",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  { inputs: [], name: "BalanceTooLow", type: "error" },
  { inputs: [], name: "BuyPunkFailed", type: "error" },
  { inputs: [], name: "ContractLocked", type: "error" },
  { inputs: [], name: "ETHNotAccepted", type: "error" },
  {
    inputs: [
      { internalType: "uint256", name: "commandIndex", type: "uint256" },
      { internalType: "bytes", name: "message", type: "bytes" },
    ],
    name: "ExecutionFailed",
    type: "error",
  },
  { inputs: [], name: "FromAddressIsNotOwner", type: "error" },
  { inputs: [], name: "InsufficientETH", type: "error" },
  { inputs: [], name: "InsufficientToken", type: "error" },
  { inputs: [], name: "InvalidBips", type: "error" },
  {
    inputs: [{ internalType: "uint256", name: "commandType", type: "uint256" }],
    name: "InvalidCommandType",
    type: "error",
  },
  { inputs: [], name: "InvalidOwnerERC1155", type: "error" },
  { inputs: [], name: "InvalidOwnerERC721", type: "error" },
  { inputs: [], name: "InvalidPath", type: "error" },
  { inputs: [], name: "InvalidReserves", type: "error" },
  { inputs: [], name: "InvalidSpender", type: "error" },
  { inputs: [], name: "LengthMismatch", type: "error" },
  { inputs: [], name: "SliceOutOfBounds", type: "error" },
  { inputs: [], name: "TransactionDeadlinePassed", type: "error" },
  { inputs: [], name: "UnableToClaim", type: "error" },
  { inputs: [], name: "UnsafeCast", type: "error" },
  { inputs: [], name: "V2InvalidPath", type: "error" },
  { inputs: [], name: "V2TooLittleReceived", type: "error" },
  { inputs: [], name: "V2TooMuchRequested", type: "error" },
  { inputs: [], name: "V3InvalidAmountOut", type: "error" },
  { inputs: [], name: "V3InvalidCaller", type: "error" },
  { inputs: [], name: "V3InvalidSwap", type: "error" },
  { inputs: [], name: "V3TooLittleReceived", type: "error" },
  { inputs: [], name: "V3TooMuchRequested", type: "error" },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "RewardsSent",
    type: "event",
  },
  {
    inputs: [{ internalType: "bytes", name: "looksRareClaim", type: "bytes" }],
    name: "collectRewards",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes", name: "commands", type: "bytes" },
      { internalType: "bytes[]", name: "inputs", type: "bytes[]" },
    ],
    name: "execute",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes", name: "commands", type: "bytes" },
      { internalType: "bytes[]", name: "inputs", type: "bytes[]" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "execute",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "", type: "address" },
      { internalType: "address", name: "", type: "address" },
      { internalType: "uint256[]", name: "", type: "uint256[]" },
      { internalType: "uint256[]", name: "", type: "uint256[]" },
      { internalType: "bytes", name: "", type: "bytes" },
    ],
    name: "onERC1155BatchReceived",
    outputs: [{ internalType: "bytes4", name: "", type: "bytes4" }],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "", type: "address" },
      { internalType: "address", name: "", type: "address" },
      { internalType: "uint256", name: "", type: "uint256" },
      { internalType: "uint256", name: "", type: "uint256" },
      { internalType: "bytes", name: "", type: "bytes" },
    ],
    name: "onERC1155Received",
    outputs: [{ internalType: "bytes4", name: "", type: "bytes4" }],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "", type: "address" },
      { internalType: "address", name: "", type: "address" },
      { internalType: "uint256", name: "", type: "uint256" },
      { internalType: "bytes", name: "", type: "bytes" },
    ],
    name: "onERC721Received",
    outputs: [{ internalType: "bytes4", name: "", type: "bytes4" }],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes4", name: "interfaceId", type: "bytes4" }],
    name: "supportsInterface",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [
      { internalType: "int256", name: "amount0Delta", type: "int256" },
      { internalType: "int256", name: "amount1Delta", type: "int256" },
      { internalType: "bytes", name: "data", type: "bytes" },
    ],
    name: "uniswapV3SwapCallback",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  { stateMutability: "payable", type: "receive" },
];
