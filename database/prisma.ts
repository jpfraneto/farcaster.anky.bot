/**
 * Prisma Database Client Configuration
 *
 * This file sets up a singleton instance of the Prisma client to connect to our PostgreSQL database.
 * It's critical for maintaining a single database connection throughout the application lifecycle,
 * preventing connection pool exhaustion during development hot reloads.
 */

import { PrismaClient } from "@prisma/client";

// Define the extended client type that includes any extensions we add to the base PrismaClient
type ExtendedPrismaClient = ReturnType<typeof extendedClient>;

// Extend the global namespace to include our Prisma client
// This allows us to store the client instance on the global object in development
declare global {
  var prisma: ExtendedPrismaClient;
}

// Determine if we're running in production mode
const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Creates a singleton instance of the Prisma client
 * In production: Creates a new client instance every time
 * In development: Reuses the global instance to prevent connection leaks during hot reloads
 */
const prismaClientSingleton = () => {
  let prisma: ExtendedPrismaClient;
  // Only run on the server, not in the browser
  if (typeof window === "undefined") {
    if (IS_PRODUCTION) {
      // In production, create a new client instance
      prisma = extendedClient();
      return prisma;
    } else if (!globalThis.prisma) {
      // In development, create a global instance if it doesn't exist yet
      globalThis.prisma = extendedClient();
      return globalThis.prisma;
    }
  }
};

/**
 * Creates an extended Prisma client with custom configuration
 * Configures logging based on the environment:
 * - Production: Only logs important information (info, warnings, errors)
 * - Development: Logs all database queries and important information
 */
function extendedClient() {
  return new PrismaClient({
    log: IS_PRODUCTION
      ? ["info", "warn", "error"]
      : ["query", "info", "warn", "error"],
  });
  // NOTE: Disable logs to check performance
  // .$extends({
  //   query: {
  //     $allModels: {
  //       async $allOperations({ operation, model, args, query }) {
  //         const start = performance.now();
  //         const result = await query(args);
  //         const end = performance.now();
  //         const time = end - start;
  //         console.log(`${model}.${operation} took ${time.toFixed(2)}ms`);
  //         return result;
  //       },
  //     },
  //   },
  // });
}

// Export the database client instance
// Uses the existing global instance if available, otherwise creates a new one
const db = globalThis.prisma ?? prismaClientSingleton();
export { db };

// In development, store the client on the global object to prevent connection leaks
if (!IS_PRODUCTION) globalThis.prisma = db;
