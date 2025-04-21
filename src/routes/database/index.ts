import { Hono } from "hono";
import { PrismaClient } from "@prisma/client";
import { isProduction } from "../../utils/environment";
import type { Context, Next } from "hono";

const dbRoute = new Hono();
const prisma = new PrismaClient();

// Middleware to check if we're in production
const checkNotProduction = async (c: Context, next: Next) => {
  if (isProduction()) {
    return c.json(
      { error: "Database routes are not available in production" },
      403
    );
  }
  await next();
};

// Apply the middleware to all routes
dbRoute.use("*", checkNotProduction);

dbRoute.get("/", async (c) => {
  return c.json({
    message: "Database routes are not available in production",
  });
});

// Check database connection
dbRoute.get("/status", async (c) => {
  try {
    // Simple query to check if database is connected
    await prisma.$queryRaw`SELECT 1`;
    return c.json({
      status: "connected",
      message: "Database connection successful",
    });
  } catch (error) {
    console.error("Database connection error:", error);
    return c.json(
      {
        status: "error",
        message: "Database connection failed",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// Get counts of records in each table
dbRoute.get("/counts", async (c) => {
  try {
    const counts = {
      users: await prisma.user.count(),
      apps: await prisma.app.count(),
      notifications: await prisma.notification.count(),
      userAppConnections: await prisma.userAppConnection.count(),
    };
    return c.json(counts);
  } catch (error) {
    console.error("Error fetching counts:", error);
    return c.json(
      {
        error: "Failed to fetch counts",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// Get sample data from each table (limited to 5 records)
dbRoute.get("/samples", async (c) => {
  try {
    const samples = {
      users: await prisma.user.findMany({ take: 5 }),
      apps: await prisma.app.findMany({ take: 5 }),
      notifications: await prisma.notification.findMany({ take: 5 }),
      userAppConnections: await prisma.userAppConnection.findMany({ take: 5 }),
    };
    return c.json(samples);
  } catch (error) {
    console.error("Error fetching samples:", error);
    return c.json(
      {
        error: "Failed to fetch samples",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// Get database schema information
dbRoute.get("/schema", async (c) => {
  try {
    // This will return information about the database schema
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    return c.json({ tables });
  } catch (error) {
    console.error("Error fetching schema:", error);
    return c.json(
      {
        error: "Failed to fetch schema",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

export default dbRoute;
