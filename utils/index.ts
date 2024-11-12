export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function addUserToAllowlist(fid: number): number {
  try {
    const fs = require("fs");
    const path = require("path");
    const filePath = path.join(process.cwd(), "data/anky_allowlist.json");

    // Create directory if it doesn't exist
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Create file with empty array if it doesn't exist
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify([]));
    }

    // Read current array
    const currentArray = JSON.parse(fs.readFileSync(filePath, "utf8"));

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
