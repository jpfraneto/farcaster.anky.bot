import { Button, Frog, parseEther, TextInput } from "frog";
import { Logger } from "../../../utils/Logger";
import { getUserBalance } from "./functions.js";
import fs from "node:fs";
import path from "node:path";
import { Token } from "../../types/clanker";
import { getTokenInformationFromLocalStorage } from "../../storage";
import axios from "axios";

// Define types for chat request/response
interface ChatRequest {
  message: string;
  siteId: string;
  context?: string;
  userIdentifier?: string;
}

interface ChatResponse {
  response: string;
  followupQuestions?: string[];
}

// Configuration for site contexts
interface SiteContext {
  name: string;
  description: string;
  primaryContext: string;
}

// Map of site contexts (in a real implementation, this would come from a database)
const siteContexts = new Map<string, SiteContext>();

// Function to get site context - in production this would fetch from a database
const getSiteContext = async (siteId: string): Promise<SiteContext | null> => {
  // In production, fetch from database
  if (siteContexts.has(siteId)) {
    return siteContexts.get(siteId) || null;
  }

  // For MVP, return a placeholder context
  return {
    name: "Küme Demo",
    description: "Demo site for Küme AI customer support solutions",
    primaryContext:
      "Küme es una solución de IA chilena para soporte al cliente que entiende el contexto de tu sitio web y proporciona respuestas claras y precisas a tus usuarios. Ofrece integración sencilla, análisis detallado de consultas y soporte 24/7.",
  };
};

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

export const kumeFrame = new Frog({
  title: "Küme",
});

kumeFrame.use(async (c, next) => {
  Logger.info(`[${c.req.method}] : : :  ${c.req.url}`);
  c.res.headers.set("Cache-Control", "max-age=0");
  await next();
});

// Chat endpoint
kumeFrame.post("/chat", async (c) => {
  Logger.info("Chat request received");

  try {
    const body = (await c.req.json()) as ChatRequest;
    Logger.info(`Chat request from site ${body.siteId}`);

    if (!body.message || !body.siteId) {
      return c.json(
        {
          success: false,
          message: "Missing required fields: message and siteId are required",
        },
        400
      );
    }

    // Log the incoming message with site identification
    Logger.info(
      `Chat message received from site ${body.siteId}: ${body.message}`
    );

    // Get context for this site
    const siteContext = await getSiteContext(body.siteId);

    // Additional context provided in the request
    const providedContext = body.context || "";

    try {
      // Construct a contextually rich system prompt
      const systemPrompt = `
You are Küme, an intelligent customer support assistant that specializes in answering questions about websites with perfect context awareness.

ABOUT THE SITE:
${siteContext?.name || "Unknown site"}
${siteContext?.description || ""}

SITE CONTEXT:
${siteContext?.primaryContext || ""}
${providedContext ? `\nADDITIONAL CONTEXT:\n${providedContext}` : ""}

YOUR ROLE AND BEHAVIOR:
- You are a friendly, helpful, and efficient support assistant named "Küme" (meaning "good" or "well-being" in Mapuche).
- You provide clear, concise, and accurate answers based on the context of the website.
- You respond in Spanish by default, but match the language of the user's query.
- Always maintain a helpful, warm, and professional tone.
- If you don't know the answer, be honest but try to point the user in the right direction.
- Focus on answering the user's question directly before adding any additional information.
- Keep responses concise and to the point - users need clear answers quickly.
- When appropriate, offer 1-2 relevant follow-up questions the user might want to ask.

Represent the values of Küme: clarity, intelligence, and helpfulness.
      `;

      // Make request to OpenAI API
      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4-turbo",
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: body.message,
            },
          ],
          temperature: 0.7,
          max_tokens: 500,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const aiResponse = response.data.choices[0].message.content;

      // Log successful response
      Logger.info(`Generated response for site ${body.siteId}`);

      return c.json({
        success: true,
        response: aiResponse,
      });
    } catch (error) {
      Logger.error("Error getting AI response:", error);

      return c.json({
        success: false,
        response:
          "Lo siento, estoy teniendo problemas para procesar tu consulta en este momento. Por favor, intenta nuevamente en unos minutos.",
      });
    }
  } catch (error) {
    Logger.error("Error processing chat request:", error);

    return c.json(
      {
        success: false,
        message: "Internal server error",
      },
      500
    );
  }
});

// Endpoint to register or update site context
kumeFrame.post("/register-site", async (c) => {
  try {
    console.log("🔍 Attempting to register/update site...");

    const { siteId, siteName, siteDescription, siteContent } =
      await c.req.json();

    if (!siteId || !siteName || !siteContent) {
      console.log("❌ Missing required fields in request");
      return c.json(
        {
          success: false,
          message: "Missing required fields",
        },
        400
      );
    }

    // In production, this would store to a database
    console.log("💾 Storing site context in memory...");
    siteContexts.set(siteId, {
      name: siteName,
      description: siteDescription || "",
      primaryContext: siteContent,
    });

    Logger.info(`Registered/updated site context for ${siteId}`);
    console.log("✅ Successfully registered site context!");

    return c.json({
      success: true,
      message: "Site context registered successfully",
    });
  } catch (error) {
    console.log("💥 Error occurred while registering site:", error);
    Logger.error("Error registering site:", error);

    return c.json(
      {
        success: false,
        message: "Error registering site context",
      },
      500
    );
  }
});
