import * as dotenv from "dotenv";
import * as path from "node:path";

// Load .env from root
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

import { Test } from "@nestjs/testing";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaClient } from "@repo/database";
import { PG_POOL } from "../prisma/prisma.module";
import { Pool } from "pg";

async function runStats() {
  const moduleRef = await Test.createTestingModule({
    imports: [PrismaModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  const prisma = app.get(PrismaClient);
  const pool = app.get<Pool>(PG_POOL);

  try {
    const imageCount = await prisma.pexelsImage.count();
    const embeddingCount = await prisma.imageEmbedding.count(); // this might fail if model not generated in client, but let's try
    // actually imageEmbedding is a model in schema

    // Check analysis jobs for impact scores
    const analysisCount = await prisma.deepSeekAnalysis.count();

    console.log(`PexelsImage Count: ${imageCount}`);
    console.log(`ImageEmbedding Count: ${embeddingCount}`);
    console.log(`DeepSeekAnalysis Count: ${analysisCount}`);

    if (analysisCount > 0) {
      // Get average impact score
      const result = await pool.query(`
         SELECT AVG((analysis_result->>'impactScore')::numeric) as avg_impact
         FROM vision_iq_deepseek_analysis
       `);
      console.log(`Average Impact Score: ${result.rows[0].avg_impact}`);
    }
  } catch (error) {
    console.error("Stats Failed:", error);
  } finally {
    await app.close();
  }
}

runStats().catch((err) => console.error(err));
