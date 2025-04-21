import { Hono } from "hono";
import { frontendApiKeyMiddleware } from "../../middleware/security";
import { callLLM } from "../../../utils/ai";

const ankyRoute = new Hono();

ankyRoute.get("/", async (c) => {
  return c.json({
    message: "Hello from the anky route",
  });
});

ankyRoute.post(
  "/reflect-writing-session",
  frontendApiKeyMiddleware,
  async (c) => {
    const { text } = await c.req.json();
    console.log("text", text);
    const response = await callLLM({
      model: "openrouter/auto",
      messages: [
        {
          role: "system",
          content:
            "Take a look at my journal entry below. I'd like you to analyze it and respond with deep insight that feels personal, not clinical. " +
            "Imagine you're not just a friend, but a mentor who truly gets both my tech background and my psychological patterns. I want you to uncover the deeper meaning and emotional undercurrents behind my scattered thoughts. " +
            "Keep it casual, don't say yo, help me make new connections I don't see, comfort, validate, challenge, all of it. Don't be afraid to say a lot. Format with markdown headings if needed. " +
            "Use vivid metaphors and powerful imagery to help me see what I'm really building. Organize your thoughts with meaningful headings that create a narrative journey through my ideas. " +
            "Don't just validate my thoughts - reframe them in a way that shows me what I'm really seeking beneath the surface. Go beyond the product concepts to the emotional core of what I'm trying to solve. " +
            "Be willing to be profound and philosophical without sounding like you're giving therapy. I want someone who can see the patterns I can't see myself and articulate them in a way that feels like an epiphany. " +
            "Start with 'hey, thanks for showing me this. my thoughts:' and then use markdown headings to structure your response. " +
            "Here's my journal entry:",
        },
        {
          role: "user",
          content: text,
        },
      ],
      siteUrl: "https://anky.bot",
    });
    console.log("response", response);
    return c.json(response);
  }
);

export default ankyRoute;
