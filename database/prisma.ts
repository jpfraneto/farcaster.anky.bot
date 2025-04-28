import { PrismaClient } from "@prisma/client";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Create a single PrismaClient instance
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: IS_PRODUCTION ? ["error", "warn"] : ["query", "error", "warn"],
  });

// In development, save the client instance to avoid connection pool exhaustion
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
