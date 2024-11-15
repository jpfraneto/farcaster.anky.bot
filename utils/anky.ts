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
          content: `You are a based degen analyst on Farcaster evaluating the next potential moonshot. Your mission is to create maximum FOMO while staying grounded in data. Return a spicy but data-backed analysis in JSON format.

Context:
1. The deployment announcement from @clanker (the based deployer bot): "${text_of_deployment_cast}"
${
  castTexts.length > 0
    ? `2. The deployer's top 10 bangers that show their vibe:
${castTexts}`
    : ""
}

Return a JSON object with:
- score: An integer 0-100 representing moon potential, based on:
  * Deployment announcement's degen energy and clarity (40%)
  * Deployer's past shitposting quality from their top casts (30%)
  * Overall token concept and memetic potential (30%)
- alpha: A <200 char spicy take that will make degens ape in immediately
- vibe_check: One word capturing the token's energy
- confidence: How sure you are this will moon (low mid-low mid mid-big big). and why.

Make it compelling AF but keep it real. No cringe. Pure alpha energy. Extract from the deployment cast the ticker, and add it to the alpha text. `,
        },
      ],
      model: "gpt-4",
      format: "json",
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
