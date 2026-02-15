import * as dotenv from "dotenv";
import * as path from "node:path";

// Load .env from root
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

import { Test } from "@nestjs/testing";
import { SemanticMatchingModule } from "../semantic-matching/semantic-matching.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ImageAnalysisModule } from "../image-analysis/image-analysis.module";
import { DeepSeekModule } from "../deepseek-integration/deepseek.module";
import { SemanticMatchingService } from "../semantic-matching/semantic-matching.service";
import { GeminiAnalysisService } from "../image-analysis/gemini-analysis.service";
import { PrismaClient } from "@repo/database";
import * as fs from "node:fs/promises";

async function runAnalysis() {
  console.log("Initializing NestJS Testing Module with Mocks...");

  // Create a mock for GeminiAnalysisService
  const mockGeminiService = {
    isEmbeddingEnabled: true,
    generateEmbedding: async (text: string) => {
      console.log(
        `[Mock] Generating embedding for query: "${text.substring(0, 20)}..."`,
      );
      return Array.from({ length: 768 }, () => (Math.random() - 0.5) * 0.2);
    },
  };

  const moduleRef = await Test.createTestingModule({
    imports: [
      PrismaModule,
      SemanticMatchingModule, // Imports ImageAnalysisModule which provides GeminiAnalysisService
      ImageAnalysisModule,
      DeepSeekModule,
    ],
  })
    .overrideProvider(GeminiAnalysisService)
    .useValue(mockGeminiService)
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  const semanticService = app.get(SemanticMatchingService);
  const prisma = app.get(PrismaClient);

  console.log("Connected to DB.");

  try {
    const scenes = await prisma.sceneIntent.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      where: {
        intent: { not: "" },
      },
      include: {
        visualIntentRequest: true,
      },
    });

    if (scenes.length === 0) {
      console.warn("No scenes found in DB to analyze.");
      return;
    }

    console.log(`Found ${scenes.length} scenes to analyze.`);
    const analysisResults = [];

    for (const scene of scenes) {
      console.log(
        `Analyzing Scene ID: ${scene.id} | Intent: ${scene.intent.substring(
          0,
          50,
        )}...`,
      );

      const sceneDto = {
        id: scene.id,
        intent: scene.intent,
        requiredImpact: scene.requiredImpact,
        preferredComposition: scene.composition as any,
      };

      // Call findAlignedImages with topK=50
      const results = await semanticService.findAlignedImages([sceneDto], 50);
      const candidates = results[0] || [];

      console.log(`  > Found ${candidates.length} candidates.`);

      const moodData = candidates.map((c) => ({
        imageId: c.imageId,
        url: c.url,
        score: c.matchScore,
        moodDna: c.metadata.moodDna,
        primaryColor: c.metadata.moodDna?.primary_color,
        temp: c.metadata.moodDna?.temp,
      }));

      analysisResults.push({
        sceneId: scene.id,
        intent: scene.intent,
        candidates: moodData,
      });
    }

    const outputPath = path.join(
      process.cwd(),
      "clustering-analysis-results.json",
    );
    await fs.writeFile(outputPath, JSON.stringify(analysisResults, null, 2));
    console.log(`Analysis written to: ${outputPath}`);
  } catch (error) {
    console.error("Analysis Failed:", error);
  } finally {
    await app.close();
  }
}

runAnalysis().catch((err) => console.error(err));
