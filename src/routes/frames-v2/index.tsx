import { Button, Frog, parseEther, TextInput } from "frog";
import { Logger } from "../../../utils/Logger.js";
import { getUserBalance } from "./functions.js";
import fs from "node:fs";
import path from "node:path";
import { Token } from "../../types/clanker.js";
import { getTokenInformationFromLocalStorage } from "../../storage/index.js";
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

export const framesV2Frame = new Frog({
  title: "Anky Frames V2",
  imageOptions,
  imageAspectRatio: "1:1",
});

framesV2Frame.use(async (c, next) => {
  Logger.info(`[${c.req.method}] : : :  ${c.req.url}`);
  c.res.headers.set("Cache-Control", "max-age=0");
  await next();
});

framesV2Frame.get("/", async (c) => {
  console.log(
    "RENDERING THE MINI APP FOR SESSION ID: ",
    c.req.param("session_id")
  );
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
