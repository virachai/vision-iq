import { Injectable, Logger, Inject } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@repo/database";
import { PRISMA_SERVICE } from "../prisma/prisma.module";
import { DeepSeekService } from "../deepseek-integration/deepseek.service";
import { PexelsIntegrationService } from "../pexels-sync/pexels-integration.service";
import { QueueService } from "../queue/queue.service";
import { SemanticMatchingService } from "../semantic-matching/semantic-matching.service";
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
    private readonly pexelsIntegrationService: PexelsIntegrationService,
    private readonly queueService: QueueService,
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
      return results;
    } catch (error) {
      this.logger.error("Image matching failed", (error as Error).message);
      throw error;
    }
  }

  /**
   * Sync Pexels library in batches
   * Handles rate limiting, error recovery, and batch queueing
   *
   * Decision: Batch-fail model
   * - If N% of a batch fails, entire sync fails (explicit retry required)
   * - Ensures data consistency and prevents partial ingestion
   */
  async syncPexelsLibrary(
    search_query = "nature",
    batchSize = 50,
    failureThreshold = 0.1, // 10% failure triggers batch fail
  ): Promise<SyncResult> {
    const result: SyncResult = {
      total_images: 0,
      total_batches: 0,
      job_ids: [],
      status: "in_progress",
      errors: [],
    };

    try {
      this.logger.log(
        `Starting Pexels sync: query="${search_query}", batchSize=${batchSize}`,
      );

      // Generator yields batches of images from Pexels API
      for await (const batch of this.pexelsIntegrationService.syncPexelsLibrary(
        search_query,
        batchSize,
      )) {
        result.total_batches = batch.total_batches;

        try {
          // Ingest batch into database
          const jobIds = await this.ingestionBatch(batch.images);
          result.job_ids.push(...jobIds);
          result.total_images += batch.images.length;

          this.logger.log(
            `Processed batch ${batch.batch_number}/${batch.total_batches} (${batch.images.length} images)`,
          );
        } catch (batchError) {
          const failedCount = batch.images.length;
          const failureRate = failedCount / batch.images.length;

          this.logger.error(
            `Batch ${batch.batch_number} failed (${failureRate * 100}%): ${
              (batchError as Error).message
            }`,
          );

          result.errors?.push(
            `Batch ${batch.batch_number}: ${(batchError as Error).message}`,
          );

          // Check if failure exceeds threshold
          if (failureRate > failureThreshold) {
            result.status = "failed";
            throw new Error(
              `Batch failure rate (${failureRate * 100}%) exceeds threshold (${
                failureThreshold * 100
              }%)`,
            );
          }
        }
      }

      result.status = "queued"; // Successfully queued all jobs
      result.total_images = result.job_ids.length;
      this.logger.log(
        `Pexels sync completed: ${result.job_ids.length} images queued`,
      );
      return result;
    } catch (error) {
      result.status = "failed";
      result.errors?.push((error as Error).message);
      this.logger.error("Pexels sync failed", (error as Error).message);
      throw error;
    }
  }

  /**
   * Ingest a batch of images into the database
   * Creates PexelsImage records and queues ImageAnalysisJobs
   */
  // biome-ignore lint/suspicious/noExplicitAny: Batch ingestion handles dynamic image objects
  private async ingestionBatch(images: Array<any>): Promise<string[]> {
    const jobIds: string[] = [];

    try {
      // Batch insert images
      for (const image of images) {
        try {
          const pexelsImage = await this.prisma.pexelsImage.upsert({
            where: { pexelsId: image.pexels_id },
            update: {}, // If exists, don't update
            create: {
              pexelsId: image.pexels_id,
              url: image.url,
              photographer: image.photographer,
              width: image.width,
              height: image.height,
              avgColor: image.avg_color,
            },
          });

          // Create analysis job for this image
          const _job = await this.prisma.imageAnalysisJob.create({
            data: {
              imageId: pexelsImage.id,
              status: "PENDING",
              retryCount: 0,
            },
          });

          // Queue image analysis in BullMQ
          const queueJobId = await this.queueService.queueImageAnalysis(
            pexelsImage.id,
            image.url,
            image.pexels_id,
          );

          jobIds.push(queueJobId);
        } catch (imageError) {
          this.logger.warn(
            `Failed to ingest image ${image.pexels_id}: ${
              (imageError as Error).message
            }`,
          );
          // Continue with next image (soft failure per batch)
        }
      }

      return jobIds;
    } catch (error) {
      this.logger.error("Batch ingestion failed", (error as Error).message);
      throw error;
    }
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

      const totalImages = await this.prisma.pexelsImage.count();
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
      this.logger.error("Failed to get stats", (error as Error).message);
      throw error;
    }
  }
}
