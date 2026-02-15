import * as dotenv from "dotenv";
import * as path from "node:path";
import * as fs from "node:fs/promises";

// Load .env from root
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

import { Test } from "@nestjs/testing";
import { SemanticMatchingService } from "../semantic-matching/semantic-matching.service";
import { PrismaClient } from "@repo/database";

// Mock data interfaces
interface MockCandidate {
  imageId: string;
  url: string;
  matchScore: number;
  metadata: {
    moodDna: {
      primary_color: string;
      secondary_color: string;
      temp: number;
    };
  };
}

async function runMockAnalysis() {
  console.log("Running Mock Analysis for Clustering Logic...");

  // We don't even need NestJS context if we just mock the data directly
  // But let's keep it structurally similar

  const mockScenes = [
    { id: "scene-1", intent: "A warm, sunny beach scene with happy people." },
    { id: "scene-2", intent: "A dark, moody cybercity night." },
    { id: "scene-3", intent: "A corporate office meeting, neutral tones." },
  ];

  const analysisResults = [];

  for (const scene of mockScenes) {
    console.log(`Analyzing Mock Scene: ${scene.intent}`);

    // Generate 50 mock candidates with varying MoodDNA
    const candidates: MockCandidate[] = [];

    // Cluster 1: Warm/Happy (matches scene 1)
    for (let i = 0; i < 20; i++) {
      candidates.push({
        imageId: `img-warm-${i}`,
        url: `https://example.com/warm-${i}.jpg`,
        matchScore: 0.8 + Math.random() * 0.2, // High score
        metadata: {
          moodDna: {
            primary_color: "#FFD700", // Gold
            secondary_color: "#FFA500", // Orange
            temp: 8000 + Math.random() * 1000, // Warm
          },
        },
      });
    }

    // Cluster 2: Cold/Dark (mismatch)
    for (let i = 0; i < 15; i++) {
      candidates.push({
        imageId: `img-cold-${i}`,
        url: `https://example.com/cold-${i}.jpg`,
        matchScore: 0.4 + Math.random() * 0.3,
        metadata: {
          moodDna: {
            primary_color: "#0000FF", // Blue
            secondary_color: "#4B0082", // Indigo
            temp: 3000 + Math.random() * 1000, // Cold
          },
        },
      });
    }

    // Cluster 3: Neutral
    for (let i = 0; i < 15; i++) {
      candidates.push({
        imageId: `img-neutral-${i}`,
        url: `https://example.com/neutral-${i}.jpg`,
        matchScore: 0.5 + Math.random() * 0.2,
        metadata: {
          moodDna: {
            primary_color: "#808080", // Gray
            secondary_color: "#FFFFFF", // White
            temp: 5500 + Math.random() * 500, // Neutral
          },
        },
      });
    }

    // Shuffle candidates to simulate real search result mix
    const shuffled = candidates.sort(() => Math.random() - 0.5);

    analysisResults.push({
      sceneId: scene.id,
      intent: scene.intent,
      candidates: shuffled.map((c) => ({
        ...c,
        score: c.matchScore,
        moodDna: c.metadata.moodDna,
        primaryColor: c.metadata.moodDna.primary_color,
        temp: c.metadata.moodDna.temp,
      })),
    });
  }

  const outputPath = path.join(
    process.cwd(),
    "clustering-analysis-results.json",
  );
  await fs.writeFile(outputPath, JSON.stringify(analysisResults, null, 2));
  console.log(`Mock Analysis written to: ${outputPath}`);
}

runMockAnalysis().catch((err) => console.error(err));
