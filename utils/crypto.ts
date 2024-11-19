import crypto from "crypto";

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable not set");
  }
  // Ensure key is proper length for AES-256
  const hash = crypto.createHash("sha256").update(key).digest();
  return hash;
}

export async function encryptString(plaintext: string): Promise<string> {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);

    let encrypted = cipher.update(plaintext, "utf8", "base64");
    encrypted += cipher.final("base64");

    // Prepend IV to encrypted data
    const combined = Buffer.concat([iv, Buffer.from(encrypted, "base64")]);
    return combined.toString("base64");
  } catch (err: unknown) {
    const error = err as Error;
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

export async function decryptString(encryptedString: string): Promise<string> {
  try {
    const key = getEncryptionKey();
    const combined = Buffer.from(encryptedString, "base64");

    // Extract IV and encrypted data
    const iv = combined.subarray(0, 16);
    const encrypted = combined.subarray(16).toString("base64");

    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);

    let decrypted = decipher.update(encrypted, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (err: unknown) {
    const error = err as Error;
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

export async function encryptUserData(userData: any): Promise<string> {
  const plaintext = JSON.stringify(userData);
  return encryptString(plaintext);
}
