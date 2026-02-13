import { prisma } from "./packages/database/src/client";

async function main() {
  console.log("Testing prisma instance...");
  console.log("Prisma defined:", !!prisma);
  if (prisma) {
    console.log("Keys:", Object.keys(prisma));
    // @ts-ignore
    console.log("PexelsImage model:", !!prisma.pexelsImage);
  }
}

main().catch(console.error);
