// wait-for-db.js
import { PrismaClient } from "@prisma/client";

const MAX_RETRIES = 5;
const RETRY_DELAY = 5000; // 5 seconds

async function checkDatabaseConnection() {
  let retries = 0;

  while (retries < MAX_RETRIES) {
    try {
      const prisma = new PrismaClient();
      await prisma.$connect();
      console.log("✅ Database connection successful");
      await prisma.$disconnect();
      return true;
    } catch (error) {
      retries++;
      console.log(
        `❌ Database connection failed (attempt ${retries}/${MAX_RETRIES})`
      );
      console.error(error);

      if (retries >= MAX_RETRIES) {
        console.error("Maximum retries reached. Exiting...");
        return false;
      }

      console.log(`Waiting ${RETRY_DELAY / 1000} seconds before retrying...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
    }
  }
}

checkDatabaseConnection().then((success) => {
  if (!success) {
    process.exit(1);
  }
});
