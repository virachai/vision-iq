import { Injectable, Logger, Inject } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@repo/database";
import { PRISMA_SERVICE } from "../prisma/prisma.module";
import { DeepSeekService } from "../deepseek-integration/deepseek.service";
import { GeminiAnalysisService } from "../image-analysis/gemini-analysis.service";
import { SemanticMatchingService } from "../semantic-matching/semantic-matching.service";
import { PexelsSyncService } from "../pexels-sync/pexels-sync.service";
import { QueueService } from "../queue/queue.service";
import type {
  ExtractVisualIntentDto,
  FindAlignedImagesDto,
  ImageMatch,
  SceneIntentDto,
} from "./dto/scene-intent.dto";

export interface SyncResult {
  total_images: number;
  total_batches: number;
  job_ids: string[];
  status: "queued" | "in_progress" | "completed" | "failed";
  errors?: string[];
}

@Injectable()
export class AlignmentService {
  private readonly logger = new Logger(AlignmentService.name);

  constructor(
    private readonly deepseekService: DeepSeekService,
    private readonly semanticMatchingService: SemanticMatchingService,
    private readonly pexelsSyncService: PexelsSyncService,
    private readonly queueService: QueueService,
    private readonly geminiAnalysisService: GeminiAnalysisService,
    @Inject(PRISMA_SERVICE) private readonly prisma: PrismaClient,
  ) {
    this.logger.log(
      `AlignmentService initialized. Prisma injected: ${!!this.prisma}`,
    );
    if (!this.prisma) {
      this.logger.error(
        "PrismaClient injection failed. this.prisma is undefined.",
      );
    } else {
      // Check if pexelsImage exists on prisma instance
      // @ts-ignore
      this.logger.log(
        `Prisma pexelsImage model available: ${!!this.prisma.pexelsImage}`,
      );
    }
  }

  /**
   * Extract visual intents from raw Gemini Live text
   * Uses DeepSeek-V3 to parse conversational narrative into structured scene objects
   */
  async extractVisualIntent(
    dto: ExtractVisualIntentDto,
  ): Promise<SceneIntentDto[]> {
    this.logger.debug(
      `Extracting visual intent from raw text (${dto.raw_gemini_text.length} chars)`,
    );

    try {
      const scenes = await this.deepseekService.extractVisualIntent(
        dto.raw_gemini_text,
      );

      if (!Array.isArray(scenes) || scenes.length === 0) {
        throw new Error("DeepSeek returned no valid scenes");
      }

      this.logger.log(
        `Successfully extracted ${scenes.length} scenes from narrative`,
      );
      return scenes;
    } catch (error) {
      this.logger.error(
        "Visual intent extraction failed",
        (error as Error).message,
      );
      throw error;
    }
  }

  /**
   * Direct test for Gemini Image Analysis
   */
  async testImageAnalysis(imageUrl: string) {
    this.logger.debug(`Direct test analysis for: ${imageUrl}`);
    return this.geminiAnalysisService.analyzeImage(imageUrl);
  }

  /**
   * Refine an existing analysis job using DeepSeek
   */
  async refineAnalysis(jobId: string) {
    this.logger.log(`Manually triggering refinement for job ${jobId}`);
    return this.geminiAnalysisService.refineWithDeepSeek(jobId);
  }

  /**
   * Find semantically aligned images for a sequence of scenes
   * Implements:
   * - Vector similarity search with pgvector
   * - Metadata filtering (impact score, composition, mood)
   * - Visual anchor logic: first image locks mood_dna for subsequent matches
   * - Ranking formula with weighted scores
   */
  async findAlignedImages(dto: FindAlignedImagesDto): Promise<ImageMatch[][]> {
    this.logger.debug(`Finding aligned images for ${dto.scenes.length} scenes`);

    if (!Array.isArray(dto.scenes) || dto.scenes.length === 0) {
      throw new Error("No scenes provided for image matching");
    }

    try {
      const topK = dto.top_k || 5;
      const moodMultiplier = dto.mood_consistency_weight || 1.0;

      const results = await this.semanticMatchingService.findAlignedImages(
        dto.scenes,
        topK,
        moodMultiplier,
      );

      this.logger.log(`Found matches for all ${results.length} scenes`);

      // Auto-Sync Logic: Check for scenes with 0 matches
      for (let i = 0; i < results.length; i++) {
        if (results[i].length === 0) {
          const missingScene = dto.scenes[i];
          this.logger.warn(
            `No matches found for scene ${i} ("${missingScene.intent}"). Triggering auto-sync...`,
          );

          // Extract keywords and queue auto-sync job
          this.deepseekService
            .extractSearchKeywords(missingScene.intent)
            .then((keywords) => {
              this.queueService.queueAutoSync(keywords);
              this.logger.log(
                `Successfully queued auto-sync job for keywords: "${keywords}"`,
              );
            })
            .catch((err) => {
              this.logger.error(
                "Keyword extraction for auto-sync failed",
                err.message,
              );
            });
        }
      }

      return results;
    } catch (error) {
      this.logger.error("Image matching failed", (error as Error).message);
      throw error;
    }
  }

  /**
   * Sync Pexels library in batches
   * Delegates to PexelsSyncService
   */
  async syncPexelsLibrary(
    search_query = "nature",
    batchSize = 50,
    failureThreshold = 0.1,
  ): Promise<SyncResult> {
    return this.pexelsSyncService.syncPexelsLibrary(
      search_query,
      batchSize,
      failureThreshold,
    );
  }

  /**
   * Health check / stats endpoint
   */
  async getStats() {
    try {
      try {
        const fs = require("fs");
        const path = require("path");
        const logPath = path.resolve(process.cwd(), "debug-getStats.log");
        fs.appendFileSync(
          logPath,
          `getStats called. this.prisma: ${!!this.prisma}\n`,
        );
        if (this.prisma) {
          const keys = Object.keys(this.prisma);
          fs.appendFileSync(logPath, `Keys: ${keys.join(",")}\n`);
          // @ts-ignore
          fs.appendFileSync(
            logPath,
            `pexelsImage: ${!!this.prisma.pexelsImage}\n`,
          );
        } else {
          fs.appendFileSync(logPath, `this.prisma is undefined\n`);
        }
      } catch (e) {
        console.error(e);
      }

      let totalImages = 0;
      try {
        totalImages = await this.prisma.pexelsImage.count();
      } catch (countError) {
        this.logger.error(
          "Error counting pexelsImage",
          (countError as Error).message,
          (countError as Error).stack,
        );
        console.error("pexelsImage.count() error:", countError);
        throw countError;
      }

      const totalEmbeddings = await this.prisma.imageEmbedding.count();
      const pendingJobs = await this.prisma.imageAnalysisJob.count({
        where: { status: "PENDING" },
      });
      const failedJobs = await this.prisma.imageAnalysisJob.count({
        where: { status: "FAILED" },
      });

      return {
        total_images: totalImages,
        total_embeddings: totalEmbeddings,
        pending_analysis_jobs: pendingJobs,
        failed_jobs: failedJobs,
        ready_for_search: totalEmbeddings, // Images with embeddings are searchable
      };
    } catch (error) {
      this.logger.error(
        "Failed to get stats",
        (error as Error).message,
        (error as Error).stack,
      );
      throw error;
    }
  }
}
