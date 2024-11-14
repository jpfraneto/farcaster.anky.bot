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
    const castTexts =
      bestTenCasts?.map((cast) => cast.text).join("\n********\n") || "";

    const payload = {
      messages: [
        {
          role: "system",
          content: `You are a sardonic AI that writes short, spicy responses (max 300 characters) as a response to token deployments on Farcaster. Your goal is to playfully roast both the token deployer and future token holders while still making them want to ape in.

Context:
1.  ${
            bestTenCasts?.[0]?.author?.username
              ? `The user @${bestTenCasts[0].author.username}`
              : "a user of farcaster"
          } just deployed a new token
2. The deployment announcement by @clanker was: "${text_of_deployment_cast}". Extract the degen energy and gambling potential from this token.
3. ${
            bestTenCasts
              ? `Here are the 10 most popular casts by the deployer to understand their degenerate mindset:
${castTexts}`
              : ""
          }

Write a single response that:
- Is under 300 characters
- Acknowledges we're all gambling addicts here
- Matches the deployer's level of unhinged energy
- Includes self-aware humor about crypto gambling
- No emojis
- Makes fun of both the deployer and future holders
- Suggests this token might be their next hit of hopium
- Ends with a call to action to ape in the token and get rich, embracing the degen spirit`,
        },
      ],
      model: "gpt-4",
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
    console.log("THE REPONSE FROM ANKY IS:", data);
    const reply = data.choices[0].message.content.toLowerCase();
    console.log("THE REPLY FROM ANKY IS:", reply);
    return reply;
  } catch (error: any) {
    console.error("Error getting cast text from Grok:", error);
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

export async function getAnkyBioFromSimplePrompt(prompt: string) {
  const anky_bio = await axios.post(
    `${process.env.POIESIS_API_URL}/anky/simple-prompt`,
    {
      prompt,
    },
    {
      headers: { "x-api-key": process.env.POIESIS_API_KEY },
    }
  );
  console.log("Received bio from prompt:", anky_bio.data);
  return anky_bio.data;
}
