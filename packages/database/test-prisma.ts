import { prisma } from "./src/client";

async function main() {
  console.log("Testing prisma instance from packages/database...");
  console.log("Prisma defined:", !!prisma);
  if (prisma) {
    console.log("Keys:", Object.keys(prisma).join(", "));
    // @ts-ignore
    console.log("PexelsImage model:", !!prisma.pexelsImage);
    // @ts-ignore
    console.log("PexelsImage type:", typeof prisma.pexelsImage);
  }
}

main().catch(console.error);
