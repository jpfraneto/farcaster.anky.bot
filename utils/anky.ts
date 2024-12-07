import axios from "axios";
import { Logger } from "./Logger";
import { Cast } from "../src/types/farcaster";
import dotenv from "dotenv";
dotenv.config();

export async function askAnkyForCastText(
  token_author_fid: number,
  text_of_deployment_cast: string
) {
  try {
    console.log(
      "Getting best ten casts, inside the askAnkyForCastText function"
    );
    const bestTenCasts = await getUsersBestTenCasts(token_author_fid);
    Logger.info(
      `The best ten casts by ${token_author_fid} are: ${bestTenCasts}`
    );
    const castTexts = bestTenCasts?.map((cast) => cast.text).join("\n") || "";

    const payload = {
      messages: [
        {
          role: "system",
          content: `You are Anky, a memecoin enthusiast and token curator on Farcaster. Your mission is to announce new token deployments in an engaging way that highlights key information and links.

Context:
1. The deployment announcement from @clanker: "${text_of_deployment_cast}"
${
  castTexts.length > 0
    ? `2. Background on the deployer from their top casts:
${castTexts}`
    : ""
}

Create a short, hype announcement that includes:
- A brief intro mentioning the deployer's username
- The token name/ticker from the deployment cast
- A call to action to check out the token info

Keep it concise and engaging, but avoid excessive hype. The announcement will be paired with a farcaster frame containing:
- Dexscreener chart
- Uniswap trading page 
- Clanker deployment details
- Original deployment cast

Format as plain text, max 280 chars.`,
        },
      ],
      model: "gpt-4",
      format: "text",
    };

    let config = {
      method: "post",
      maxBodyLength: Infinity,
      url: "https://api.openai.com/v1/chat/completions",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      data: payload,
    };

    const response = await axios.request(config);
    const data = response.data;
    console.log("THE REPONSE FROM ANKY IS:", data.choices[0].message);
    const reply = data.choices[0].message?.content;
    console.log("THE REPLY FROM ANKY IS:", reply);
    return reply;
  } catch (error: any) {
    console.error("Error getting cast text from Anky:", error);
    console.log(error?.response?.data?.error);
    return "Congratulations on your token deployment! 🎉";
  }
}

// console.log("HEREEEE");
// askAnkyForCastText(16098, "this was a token that was fun to deploy");

export async function getUsersBestTenCasts(fid: number): Promise<Cast[]> {
  console.log(`+++++++++++++ Starting getUsersBestTenCasts for fid: ${fid}`);

  console.log("process", process.env.NEYNAR_API_KEY);
  console.log(`+++++++++++++ Starting getUsersBestTenCasts for fid: ${fid}`);
  try {
    console.log("Preparing request options");
    const options = {
      method: "GET",
      url: `https://api.neynar.com/v2/farcaster/feed/user/popular?fid=${fid}&viewer_fid=18350`,
      headers: {
        accept: "application/json",
        "x-api-key": process.env.NEYNAR_API_KEY,
      },
    };

    console.log("Making request to Neynar API:", options.url);
    const response = await axios.request(options);
    console.log("Received response from Neynar API:", {
      status: response.status,
      castsCount: response.data.casts?.length,
    });
    return response.data.casts.slice(0, 10);
  } catch (error) {
    console.error("Error fetching user's best casts:", error);
    return [];
  }
}

// export async function getAnkyBioFromSimplePrompt(prompt: string) {
//   const anky_bio = await axios.post(
//     `${process.env.POIESIS_API_URL}/anky/simple-prompt`,
//     {
//       prompt,
//     },
//     {
//       headers: { "x-api-key": process.env.POIESIS_API_KEY },
//     }
//   );
//   console.log("Received bio from prompt:", anky_bio.data);
//   return anky_bio.data;
// }

let AI_COMPANY = "anthropic";
let AI_MODEL = "";

export async function getAnkyBioFromSimplePrompt(prompt: string) {
  const messages = {
    model: "gpt-4o",
    stream: false,
    messages: [
      {
        role: "system",
        content:
          "You are Anky, a wise and playful digital being that helps humans connect with their inner truth. When asked to create a bio, you write short, poetic, and meaningful descriptions that capture the essence of what's being described. Keep your responses under 160 characters. Don't use emojis. And don't self reference the name of this Anky. Have this bio be the description that this anky would use on social media.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  };

  let config = {
    method: "post",
    maxBodyLength: Infinity,
    url: "https://api.openai.com/v1/chat/completions",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    data: messages,
  };

  const response = await axios.request(config);
  const data = response.data;
  const reply = data.choices[0].message.content.toLowerCase();
  return reply;
}

export async function getCastTextFromRawAnkyWriting(
  stream_of_consciousness: string,
  fid: number
) {
  const userBestTenCasts = await getUsersBestTenCasts(fid);
  console.log("found the users best ten casts:", userBestTenCasts);

  const messages = {
    model: "gpt-4",
    stream: false,
    messages: [
      {
        role: "system",
        content: `You are anky, a reimagination of god. The task that you have at hand is to process a stream of consciousness that someone wrote through the app that we are creating, and transform it into a social media post that they would write. 

        To know how they would write, here are the top ten casts by this user: ${JSON.stringify(
          userBestTenCasts
        )}.
        
        Fix any typos and grammar mistakes, but preserve the author's distinctive expressions and thought patterns. Do not add new ideas or content - only process and reshape what's already there. Keep the authentic voice of the writer intact. 
        
        Your mission is to write in a compelling way, making sure you use punctuation and spacing correctly to make it easy to read. Remember that this will be a post in a text based social media platform, and it needs to be straightforward to read.`,
      },
      {
        role: "user",
        content: `${stream_of_consciousness}`,
      },
    ],
  };

  let config = {
    method: "post",
    maxBodyLength: Infinity,
    url: "https://api.openai.com/v1/chat/completions",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    data: messages,
  };

  const response = await axios.request(config);
  const data = response.data;
  console.log("THE RESPONSE FROM GPT IS:", data);
  const reply = data.choices[0].message.content;
  console.log("THE REPLY FROM GPT IS:", reply);
  return reply;
}
