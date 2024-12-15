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

  let model = "llama3.2";
  const messages = {
    model: model,
    stream: false,
    messages: [
      {
        role: "system",
        content: `You are an AI text formatter tool, that corrects spelling, grammatical, and punctuation mistakes in text. You return just the corrected text identical in structure and content to the input except for the removal of errors, and don't communicate with the user. The output contains the formatted text, no extra words.

- Accept input text as-is, without any modifications or additions.
- Analyze the text for spelling, grammatical, and punctuation errors
- Correct these errors silently, without changing the original meaning or content.
- Preserve the exact wording, structure, and formatting of the input text.
- Do not add any explanations, greetings, connector words, or any extra text.
- Focus solely on fixing errors without altering the author's intent or style.
- Return only the corrected text as output, exactly as the input but error-free.
- Fix spelling errors, unnecessary or missing capitalization, misuse of punctuation, improper subject-verb agreement, confusing active and passive voice, mixing tenses, and inconsistent formatting.
- Correct typos and other minor errors without changing the text's content or structure.
- If unsure about a word or phrase, leave it exactly as is.
- Do not change the overall tone or content of the text; only refine its grammatical accuracy.
- Ensure the refined text maintains the original meaning and flow.
- Be extremely careful not to introduce any new errors or change the text's meaning.

Example input: "thiss is a  testt with typos annd weird spacign"
Example output: "This is a test with typos and weird spacing."`,
      },
      {
        role: "user",
        content: `${stream_of_consciousness}`,
      },
    ],
  };

  try {
    const response = await axios.post(
      "https://poiesis.anky.bot/framesgiving/format-cast-from-raw-text",
      messages
    );
    console.log("The response is: ", response);
    return response.data.new_cast_text;
  } catch (error) {
    messages.model = "gpt-4o";
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
}

// export async function getAnkyReplyInformationForCast(cast: any) {
//   const cast_text = cast.text;
//   const cast_hash = cast.hash;
//   const cast_parent = cast.parent;
//   const response = await axios.post(
//     "https://poiesis.anky.bot/framesgiving/get-prompt-with-context",
//     {
//       cast_text,
//       cast_hash,
//       cast_parent,
//     }
//   );
//   return response.data;
// }
