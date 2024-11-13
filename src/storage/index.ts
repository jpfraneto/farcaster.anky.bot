import { Token } from "../types/clanker";
import path from "path";
import fs from "fs";
import { Logger } from "../../utils/Logger";

export async function getTokenInformationFromLocalStorage(
  tokenAddress: string
): Promise<Token> {
  try {
    const filePath = path.join(
      process.cwd(),
      "data/tokens_and_their_info.json"
    );
    const fileContent = fs.readFileSync(filePath, "utf8");
    const tokens = JSON.parse(fileContent);
    return tokens[tokenAddress];
  } catch (error) {
    Logger.error(error);
    throw new Error("Token not found");
  }
}

export async function upsertTokenInformationInLocalStorage(token: Token) {
  try {
    const filePath = path.join(
      process.cwd(),
      "data/tokens_and_their_info.json"
    );

    // Create directory if it doesn't exist
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Create file with empty object if it doesn't exist
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify({}));
    }

    const fileContent = fs.readFileSync(filePath, "utf8");
    const tokens = JSON.parse(fileContent);
    tokens[token.address!] = token;
    fs.writeFileSync(filePath, JSON.stringify(tokens, null, 2));
  } catch (error) {
    Logger.error(error);
    throw new Error("Failed to save token information");
  }
}
