export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
import fs from "fs";
import path from "path";

export function addUserToAllowlist(fid: number): number {
  try {
    const filePath = path.join(process.cwd(), "data/anky_allowlist.json");

    // Create directory if it doesn't exist
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let currentArray: number[] = [];

    // Create file with empty array if it doesn't exist
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(currentArray));
    } else {
      // Read current array, handle potential parse errors
      try {
        const fileContent = fs.readFileSync(filePath, "utf8");
        if (fileContent.trim()) {
          currentArray = JSON.parse(fileContent);
        }
      } catch (parseError) {
        console.error(
          "Error parsing allowlist file, resetting to empty array:",
          parseError
        );
        fs.writeFileSync(filePath, JSON.stringify(currentArray));
      }
    }

    // Add new fid if not already present
    if (!currentArray.includes(fid)) {
      currentArray.push(fid);
      fs.writeFileSync(filePath, JSON.stringify(currentArray, null, 2));
    }

    return currentArray.length;
  } catch (error) {
    console.error("Error managing allowlist:", error);
    throw error;
  }
}

export async function retryWithExponentialBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 5,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;

      // Calculate quadratic exponential delay: baseDelay * (attempt + 1)^2
      const delay = baseDelay * Math.pow(attempt + 1, 2);
      console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Max retries exceeded");
}
