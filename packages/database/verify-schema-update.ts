import "dotenv/config";
import { prisma } from "./src/client";

async function main() {
  console.log("Verifying schema updates...");

  try {
    // Check PexelsImage.source
    console.log("Checking PexelsImage.source...");
    // @ts-ignore: Ignore TS error if types not regenerated yet, we want runtime check
    const image = await prisma.pexelsImage.findFirst({
      select: { id: true, source: true },
    });
    console.log("PexelsImage.source query successful.");

    // Check ImageAnalysisJob.isUsed
    console.log("Checking ImageAnalysisJob.isUsed...");
    // @ts-ignore
    const job = await prisma.imageAnalysisJob.findFirst({
      select: { id: true, isUsed: true },
    });
    console.log("ImageAnalysisJob.isUsed query successful.");

    console.log("Schema verification PASSED.");
  } catch (error) {
    console.error("Schema verification FAILED:", error);
    process.exit(1);
  }
}

main();
