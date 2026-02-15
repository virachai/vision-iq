import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { SemanticMatchingService } from "../semantic-matching/semantic-matching.service";
import { PrismaService } from "../prisma/prisma.service";
import * as fs from "node:fs/promises";
import * as path from "node:path";

async function runAnalysis() {
  console.log("Initializing NestJS Application Context...");

  const app = await NestFactory.createApplicationContext(AppModule);
  // Ensure we can get the service. If it fails, we might need to import SemanticMatchingModule directly
  // but AppModule imports AlignmentModule which likely imports SemanticMatchingModule
  const semanticService = app.get(SemanticMatchingService);
  const prismaService = app.get(PrismaService);

  console.log("Connected to DB.");

  try {
    // 1. Fetch 5 random/recent SceneIntents that are 'PENDING' or 'COMPLETED' (to ensure flow is valid)
    // We want scenes that part of a request, to test sequential logic if we wanted,
    // but for clustering we just need scenes with INTENTS logic.
    const scenes = await prismaService.sceneIntent.findMany({
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

      // We need to map the Prisma model to the DTO expected by the service
      // The service expects SceneIntentDto[]
      // Let's create a DTO from the prism object
      const sceneDto = {
        id: scene.id,
        intent: scene.intent,
        requiredImpact: scene.requiredImpact,
        preferredComposition: scene.composition as any,
        // We might be missing 'visualIntent' if it's not in the DB model or passed differently.
        // But SemanticMatchingService uses it optionally.
      };

      // Call findAlignedImages with topK=50
      // The service expects an array of scenes, but we can process one by one
      // to isolate the "candidate" pool for *that specific scene*
      // without previous context (or we can fake it).
      // Let's passed just this scene to get its specific candidates.

      // Note: findAlignedImages returns ImageMatch[][] (array of arrays)
      const results = await semanticService.findAlignedImages([sceneDto], 50);
      const candidates = results[0] || [];

      console.log(`  > Found ${candidates.length} candidates.`);

      const moodData = candidates.map((c) => ({
        imageId: c.imageId,
        url: c.url,
        score: c.matchScore,
        moodDna: c.metadata.moodDna,
        // Helper for manual verification
        primaryColor: c.metadata.moodDna?.primary_color,
        temp: c.metadata.moodDna?.temp,
      }));

      analysisResults.push({
        sceneId: scene.id,
        intent: scene.intent,
        candidates: moodData,
      });
    }

    // Write to file
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
