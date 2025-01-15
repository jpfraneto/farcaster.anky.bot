import axios from "axios";

async function downloadImage() {
  try {
    console.log("Starting image download from imgur...");

    const response = await axios({
      method: "get",
      url: "https://i.imgur.com/HUobpk7.jpg",
      responseType: "stream",
    });

    console.log("Got response from imgur");
    console.log("Content type:", response.headers["content-type"]);
    console.log("Content length:", response.headers["content-length"]);

    const writer = require("fs").createWriteStream("./downloaded-image.jpg");

    console.log("Created write stream");

    response.data.pipe(writer);

    return new Promise<void>((resolve, reject) => {
      writer.on("finish", () => {
        console.log(
          "Successfully downloaded and saved image to downloaded-image.jpg"
        );
        resolve();
      });
      writer.on("error", (err: Error) => {
        console.error("Error writing file:", err);
        reject(err);
      });
    });
  } catch (error) {
    console.error("Error downloading image:", error);
    throw error;
  }
}

// Execute the download
downloadImage().catch((err) => {
  console.error("Top level error:", err);
  process.exit(1);
});
