import "dotenv/config";
import { PrismaClient } from "./generated/client";

async function main() {
  console.log("Verifying schema updates with direct PrismaClient...");

  const prisma = new PrismaClient();

  try {
    // Check PexelsImage.source
    console.log("Checking PexelsImage.source...");
    const image = await prisma.pexelsImage.findFirst({
      select: { id: true, source: true },
    });
    console.log("PexelsImage.source query successful.");

    // Check ImageAnalysisJob.isUsed
    console.log("Checking ImageAnalysisJob.isUsed...");
    const job = await prisma.imageAnalysisJob.findFirst({
      select: { id: true, isUsed: true },
    });
    console.log("ImageAnalysisJob.isUsed query successful.");

    console.log("Schema verification PASSED.");
  } catch (error) {
    console.error("Schema verification FAILED:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
