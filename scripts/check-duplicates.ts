import { PrismaClient } from "./packages/database/generated/client";
import dotenv from "dotenv";
dotenv.config();

const prisma = new PrismaClient();

async function checkDuplicates() {
  const duplicates = await prisma.$queryRaw`
    SELECT "visualDescriptionId", "keyword", COUNT(*)
    FROM "vision_iq_visual_description_keywords"
    GROUP BY "visualDescriptionId", "keyword"
    HAVING COUNT(*) > 1
  `;

  if (Array.isArray(duplicates) && duplicates.length > 0) {
    console.log("Found duplicates:", duplicates);
  } else {
    console.log("No duplicates found.");
  }
}

checkDuplicates()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
