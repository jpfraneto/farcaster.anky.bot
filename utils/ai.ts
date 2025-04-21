import { OPENROUTER_API_KEY } from "../env/server-env";
import { Logger } from "./Logger";

/**
 * Calls an LLM through OpenRouter API
 * @param {Object} options - Options for the LLM call
 * @param {string} [options.model="openai/gpt-4o"] - The model to use
 * @param {Array<{role: string, content: string}>} options.messages - The messages to send to the LLM
 * @param {string} [options.siteUrl] - Optional site URL for rankings on openrouter.ai
 * @param {string} [options.siteName] - Optional site name for rankings on openrouter.ai
 * @returns {Promise<any>} The response from the LLM
 */
export async function callLLM({
  model = "openrouter/auto",
  messages,
  siteUrl,
  siteName,
}: {
  model?: string;
  messages: Array<{ role: string; content: string }>;
  siteUrl?: string;
  siteName?: string;
}): Promise<any> {
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    };

    if (siteUrl) {
      headers["HTTP-Referer"] = siteUrl;
    }

    if (siteName) {
      headers["X-Title"] = siteName;
    }

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      Logger.error(`LLM API error: ${response.status} ${response.statusText}`, {
        errorData,
      });
      throw new Error(
        `LLM API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    Logger.error(
      `Error calling LLM: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error;
  }
}
