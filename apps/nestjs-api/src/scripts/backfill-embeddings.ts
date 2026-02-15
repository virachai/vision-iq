import * as dotenv from "dotenv";
import * as path from "node:path";
import * as crypto from "node:crypto";

// Load .env from root
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

import { Test } from "@nestjs/testing";
import { PrismaModule } from "../prisma/prisma.module";
import { ImageAnalysisModule } from "../image-analysis/image-analysis.module";
import { DeepSeekModule } from "../deepseek-integration/deepseek.module";
import { PrismaClient } from "@repo/database";

async function backfillEmbeddings() {
  console.log("Initializing NestJS Testing Module...");

  const moduleRef = await Test.createTestingModule({
    imports: [PrismaModule, ImageAnalysisModule, DeepSeekModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  const prisma = app.get(PrismaClient);

  console.log("Connected to DB.");

  try {
    // 1. Find ImageAnalysisJobs that have DeepSeekAnalysis
    const jobs = await prisma.imageAnalysisJob.findMany({
      take: 200,
      where: {
        deepseekAnalysis: {
          isNot: null,
        },
      },
      include: {
        deepseekAnalysis: true,
        pexelsImage: {
          include: {
            embedding: true,
          },
        },
      },
    });

    console.log(`Found ${jobs.length} completed analysis jobs.`);

    let count = 0;
    for (const job of jobs) {
      if (count >= 100) break;
      const img = job.pexelsImage;

      if (!img) continue;
      if (img.embedding) {
        continue;
      }

      const dimension = 768;
      const vectorValues = Array.from(
        { length: dimension },
        () => (Math.random() - 0.5) * 0.2,
      );

      // Properly format the array string for Postgres
      // It must look like: {0.1,0.2,...}
      const vectorStr = `{${vectorValues.join(",")}}`;

      const id = crypto.randomUUID();

      try {
        console.log(`Generating MOCK embedding for image ${img.id}...`);

        // Use executeRawUnsafe if available, or executeRaw with tagged template
        // IMPORTANT: Float[] in Prisma usually maps to float8[] in Postgres.
        await prisma.$executeRaw`
                INSERT INTO "vision_iq_image_embeddings" ("id", "imageId", "embedding", "updatedAt", "createdAt")
                VALUES (${id}::uuid, ${img.id}, ${vectorStr}::float8[], NOW(), NOW())
                ON CONFLICT ("imageId") DO NOTHING
            `;

        console.log(`  > Saved MOCK embedding.`);
        count++;
      } catch (e) {
        console.error(`  > Failed to embed image ${img.id}:`, e);
        // Log inner error if any
      }
    }
    console.log(`Backfill complete. Inserted ${count} embeddings.`);
  } catch (error) {
    console.error("Backfill Failed:", error);
  } finally {
    await app.close();
  }
}

backfillEmbeddings().catch((err) => console.error(err));
