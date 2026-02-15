import * as dotenv from "dotenv";
import * as path from "node:path";

// Load .env from root
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

import { Test } from "@nestjs/testing";
import { PrismaModule } from "../prisma/prisma.module";
import { ImageAnalysisModule } from "../image-analysis/image-analysis.module";
import { DeepSeekModule } from "../deepseek-integration/deepseek.module";
import { SemanticMatchingService } from "../semantic-matching/semantic-matching.service";
import { ClusteringService } from "../semantic-matching/clustering.service";
import { GeminiAnalysisService } from "../image-analysis/gemini-analysis.service";
import { ImageMatch, MoodDna } from "../alignment/dto/scene-intent.dto";

// Mock data interfaces
interface MockCandidate extends ImageMatch {}

async function runComparison() {
  console.log("Running Clustering vs Greedy Comparison...");

  // Mock Gemini
  const mockGeminiService = {
    isEmbeddingEnabled: true,
    generateEmbedding: async (text: string) => {
      return Array.from({ length: 768 }, () => (Math.random() - 0.5) * 0.2);
    },
  };

  // Create real module to test integration
  const moduleRef = await Test.createTestingModule({
    imports: [PrismaModule, ImageAnalysisModule, DeepSeekModule],
    providers: [SemanticMatchingService, ClusteringService],
  })
    .overrideProvider(GeminiAnalysisService)
    .useValue(mockGeminiService)
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  const clusteringService = app.get(ClusteringService);

  // Mock candidates with clear clusters
  const candidates: ImageMatch[] = [];

  // Cluster A: Warm (Gold/Orange)
  for (let i = 0; i < 10; i++) {
    candidates.push({
      imageId: `warm-${i}`,
      pexelsId: `p-warm-${i}`,
      url: `http://warm-${i}.jpg`,
      matchScore: 0.85, // High scores
      vectorSimilarity: 0.8,
      impactRelevance: 0.8,
      compositionMatch: 0.8,
      moodConsistencyScore: 0.8,
      metadata: {
        moodDna: {
          temp: 6000,
          primary_color: "#FFD700",
          vibe: "warm",
          emotional_intensity: "medium",
          rhythm: "calm",
        },
      },
    });
  }
  // Cluster B: Cold (Blue)
  for (let i = 0; i < 10; i++) {
    candidates.push({
      imageId: `cold-${i}`,
      pexelsId: `p-cold-${i}`,
      url: `http://cold-${i}.jpg`,
      matchScore: 0.82, // Slightly lower but competitive
      vectorSimilarity: 0.8,
      impactRelevance: 0.8,
      compositionMatch: 0.8,
      moodConsistencyScore: 0.8,
      metadata: {
        moodDna: {
          temp: 3000,
          primary_color: "#0000FF",
          vibe: "cold",
          emotional_intensity: "medium",
          rhythm: "calm",
        },
      },
    });
  }

  // Shuffle
  const shuffled = candidates.sort(() => Math.random() - 0.5);

  console.log(`\n--- Test Case: Context is WARM (6000K) ---`);
  // If previous image was warm, clustering should pick WARM cluster even if Cold has some high individual scores

  const warmContext: MoodDna = {
    temp: 6000,
    primary_color: "#FFD700",
    vibe: "warm",
    emotional_intensity: "medium",
    rhythm: "calm",
  };

  // 1. Group
  const clusters = clusteringService.groupCandidatesByMood(shuffled);
  console.log(`Grouped into ${clusters.length} clusters.`);
  clusters.forEach((c, i) => {
    const avgTemp =
      c.reduce((sum, img) => sum + (img.metadata.moodDna.temp || 0), 0) /
      c.length;
    console.log(
      `  Cluster ${i}: ${c.length} images, Avg Temp: ${Math.round(avgTemp)}K`,
    );
  });

  // 2. Select
  const bestCluster = clusteringService.selectBestCluster(
    clusters,
    warmContext,
  );
  const avgBestTemp =
    bestCluster.reduce(
      (sum, img) => sum + (img.metadata.moodDna.temp || 0),
      0,
    ) / bestCluster.length;
  console.log(
    `Selected Cluster Avg Temp: ${Math.round(avgBestTemp)}K (Target: 6000K)`,
  );

  if (Math.abs(avgBestTemp - 6000) < 500) {
    console.log("✅ SUCCESS: Selected Warm cluster.");
  } else {
    console.log("❌ FAIL: Did not select Warm cluster.");
  }

  // 3. Greedy Context
  console.log(`\n--- Test Case: Context is COLD (3000K) ---`);
  const coldContext: MoodDna = {
    temp: 3000,
    primary_color: "#0000FF",
    vibe: "cold",
    emotional_intensity: "medium",
    rhythm: "calm",
  };
  const bestClusterCold = clusteringService.selectBestCluster(
    clusters,
    coldContext,
  );
  const avgBestTempCold =
    bestClusterCold.reduce(
      (sum, img) => sum + (img.metadata.moodDna.temp || 0),
      0,
    ) / bestClusterCold.length;
  console.log(
    `Selected Cluster Avg Temp: ${Math.round(
      avgBestTempCold,
    )}K (Target: 3000K)`,
  );

  if (Math.abs(avgBestTempCold - 3000) < 500) {
    console.log("✅ SUCCESS: Selected Cold cluster.");
  } else {
    console.log("❌ FAIL: Did not select Cold cluster.");
  }

  await app.close();
}

runComparison().catch((err) => console.error(err));
