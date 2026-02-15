import "dotenv/config";
import { prisma } from "./src/client";

async function main() {
  console.log(
    "POSTGRES_URL:",
    process.env.POSTGRES_URL ? "Defined" : "UNDEFINED",
  );
  if (!process.env.POSTGRES_URL) {
    console.log("Loading .env from root...");
    require("dotenv").config({ path: "../../.env" });
    console.log(
      "POSTGRES_URL after load:",
      process.env.POSTGRES_URL ? "Defined" : "Still UNDEFINED",
    );
  }
  console.log("Testing prisma instance from packages/database...");
  console.log("Prisma defined:", !!prisma);
  if (prisma) {
    console.log("Keys:", Object.keys(prisma).join(", "));
    // @ts-ignore
    console.log("PexelsImage model:", !!prisma.pexelsImage);
    // @ts-ignore
    console.log("PexelsImage type:", typeof prisma.pexelsImage);

    try {
      console.log("Attempting to count PexelsImage...");
      // @ts-ignore
      const count = await prisma.pexelsImage.count();
      console.log("Successfully connected! Count:", count);
    } catch (err) {
      console.error("Failed to query database:", err);
      process.exit(1);
    }
  }
}

main().catch(console.error);
