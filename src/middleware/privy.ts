import { Next } from "hono";
import { Context } from "hono";
import { PrivyClient } from "@privy-io/server-auth";
import * as jose from "jose";
import { Logger } from "../../utils/Logger";

const privy = new PrivyClient(
  process.env.PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!
);

export async function checkPrivyAuth(c: Context, next: Next) {
  Logger.info("Starting Privy authentication check");

  // Get auth token from Authorization header
  const authHeader = c.req.header("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    Logger.error(
      "Authentication failed: Missing or invalid authorization header"
    );
    return c.json({ error: "Missing or invalid authorization header" }, 401);
  }

  const authToken = authHeader.replace("Bearer ", "");
  Logger.info("Extracted auth token from header");

  try {
    // First attempt: Verify token using Privy client
    Logger.info("Attempting to verify token with Privy client");
    const verifiedClaims = await privy.verifyAuthToken(
      authToken,
      process.env.PRIVY_VERIFICATION_KEY
    );

    Logger.info(
      `Successfully verified token for user: ${verifiedClaims.userId}`
    );
    c.set("userId", verifiedClaims.userId);
    await next();
  } catch (error) {
    // Second attempt: Manual JWT verification if Privy client fails
    Logger.info(
      "Privy client verification failed, attempting manual JWT verification"
    );
    try {
      const verificationKey = await jose.importSPKI(
        process.env.PRIVY_VERIFICATION_KEY!,
        "ES256"
      );

      const payload = await jose.jwtVerify(authToken, verificationKey, {
        issuer: "privy.io",
        audience: process.env.PRIVY_APP_ID,
      });

      Logger.info(`Successfully verified JWT for user: ${payload.payload.sub}`);
      c.set("userId", payload.payload.sub);
      await next();
    } catch (joseError) {
      Logger.error("Authentication failed: Invalid auth token", joseError);
      return c.json({ error: "Invalid auth token" }, 401);
    }
  }
}
