import axios from "axios";
import { getUsersBestTenCasts } from "./farcaster";

export async function askAnkyForCastText(
  deployer_of_token_fid: number,
  cast_hash: string,
  token_author: string,
  text_of_deployment_cast: string
) {
  try {
    const bestTenCasts = await getUsersBestTenCasts(deployer_of_token_fid);
    const castTexts = bestTenCasts.map((cast) => cast.text).join("\n");

    const response = await axios.post("https://api.x.ai/v1/chat/completions", {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROK_API_KEY}`,
      },
      data: {
        messages: [
          {
            role: "system",
            content: `You are a witty and insightful AI that writes short, engaging responses (max 300 characters) to token deployments on Farcaster. Your goal is to make readers smile while acknowledging the token deployment.

Context:
1. The user @${token_author} just deployed a new token
2. The deployment announcement by @clanker was: "${text_of_deployment_cast}". extract from it the underlying energy of this token.
3. Here are the 10 most popular casts by the user that launched this token to understand their style:
${castTexts}

Write a single response that:
- Is under 300 characters
- References the deployment context
- Matches the user's communication style based on their past casts
- Includes either humor, wisdom, or both
- Do not include emojis
- Feels personal and engaging
- Speak to the degenerate nature of the human condition in a funny way`,
          },
        ],
        model: "grok-beta",
        stream: false,
        temperature: 0.9,
      },
    });

    const data = response.data;
    console.log("THE REPONSE FROM GROK IS:", data);
    return data.choices[0].message.content;
  } catch (error) {
    console.error("Error getting cast text from Grok:", error);
    return "Congratulations on your token deployment! 🎉";
  }
}
