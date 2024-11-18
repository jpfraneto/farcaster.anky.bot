import { Button, Frog, parseEther, TextInput } from "frog";
import { Logger } from "../../../utils/Logger";
import { getUserBalance } from "./functions.js";
import fs from "node:fs";
import path from "node:path";
import { Token } from "../../types/clanker";
import { getTokenInformationFromLocalStorage } from "../../storage";
import axios from "axios";

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

export const ankyFrame = new Frog({
  title: "Anky",
  imageOptions,
});

ankyFrame.use(async (c, next) => {
  Logger.info(`[${c.req.method}] : : :  ${c.req.url}`);
  c.res.headers.set("Cache-Control", "max-age=0");
  await next();
});

ankyFrame.get("/mini-app/:session_id", async (c) => {
  const html = fs.readFileSync(
    path.join(process.cwd(), "public/static/miniapp.html"),
    "utf-8"
  );
  return new Response(html, {
    headers: {
      "content-type": "text/html",
    },
  });
});

ankyFrame.frame("/:session_id", async (c) => {
  try {
    const session_id = c.req.param("session_id");
    console.log("THE SESSION ID IS", session_id);
    const image_url = `https://res.cloudinary.com/dppvay670/image/upload/v1731948405/${session_id}.png`;
    const parsedImageUrl = decodeURIComponent(image_url as string);
    const isImage = await axios
      .head(parsedImageUrl)
      .then((response) =>
        response.headers["content-type"]?.startsWith("image/")
      )
      .catch(() => false);
    return c.res({
      title: "anky",
      image: isImage
        ? parsedImageUrl
        : "https://github.com/jpfraneto/images/blob/main/anky.png?raw=true",
      intents: [
        <Button.MiniApp action={`/anky/mini-app/${session_id}`}>
          anky
        </Button.MiniApp>,
      ],
    });
  } catch (error) {
    return frameError(error, c, new Date().getTime());
  }
});

ankyFrame.miniApp(
  "/mini-app/:session_id",
  (c) =>
    c.res({
      title: "anky",
      url: `${
        "https://farcaster.anky.bot" ?? "http://localhost:3000"
      }/anky/mini-app/${c.req.param("session_id")}`,
    }),
  {
    name: "Anky Reader",
    description: "Read a stream of consciousness written as Anky",
    imageUrl: "",
    icon: "log",
  }
);

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
