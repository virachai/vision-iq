import { Injectable, Logger, Inject } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@repo/database";
import { PRISMA_SERVICE } from "../prisma/prisma.module";
import { DeepSeekService } from "../deepseek-integration/deepseek.service";
import { GeminiAnalysisService } from "../image-analysis/gemini-analysis.service";
import { SemanticMatchingService } from "../semantic-matching/semantic-matching.service";
import { PexelsSyncService } from "../pexels-sync/pexels-sync.service";
import { QueueService } from "../queue/queue.service";
import type { SyncResult } from "../shared/pipeline-types";
import type {
  ExtractVisualIntentDto,
  FindAlignedImagesDto,
  ImageMatch,
  SceneIntentDto,
} from "./dto/scene-intent.dto";

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
      // 1. Persist the raw request
      const request = await this.prisma.visualIntentRequest.create({
        data: {
          rawGeminiText: dto.raw_gemini_text,
          status: "IN_PROGRESS",
        },
      });

      const scenes = await this.deepseekService.extractVisualIntent(
        dto.raw_gemini_text,
      );

      if (!Array.isArray(scenes) || scenes.length === 0) {
        throw new Error("DeepSeek returned no valid scenes");
      }

      // 2. Persist each extracted scene intent and EXPAND it
      for (let index = 0; index < scenes.length; index++) {
        const sceneData = scenes[index];
        const scene = await this.prisma.sceneIntent.create({
          data: {
            visualIntentRequestId: request.id,
            sceneIndex: index,
            intent: sceneData.intent,
            requiredImpact: sceneData.required_impact,
            composition: sceneData.preferred_composition as any,
            status: "IN_PROGRESS",
          },
        });

        this.logger.debug(
          `Expanding scene ${index} ("${scene.intent.substring(0, 30)}...")`,
        );

        try {
          // 3. Deepseek Expansion: 1 raw intent to many detailed descriptions
          const expanded = await this.deepseekService.expandSceneIntent(
            sceneData.intent,
          );

          for (const exp of expanded) {
            const analysisData = exp.analysis as any;
            const description = await this.prisma.visualDescription.create({
              data: {
                sceneIntentId: scene.id,
                description: exp.description,
                status: "IN_PROGRESS",
                keywords: {
                  create:
                    analysisData?.keywords?.map((k: string) => ({
                      keyword: k,
                    })) || [],
                },
              },
            });

            // 4. Automated Flow: Trigger image matching/syncing if requested
            if (dto.auto_match) {
              try {
                this.logger.log(
                  `Auto-match triggered for expanded description: "${exp.description.substring(
                    0,
                    30,
                    125,
                  )}..."`,
                );

                // Trigger Pexels Sync for each keyword with tracking
                const keywords =
                  await this.prisma.visualDescriptionKeyword.findMany({
                    where: { visualDescriptionId: description.id },
                  });

                for (const kw of keywords) {
                  this.pexelsSyncService
                    .syncPexelsLibrary(
                      kw.keyword,
                      100,
                      0.1,
                      description.id,
                      kw.id,
                    )
                    .then(async () => {
                      await this.prisma.visualDescriptionKeyword.update({
                        where: { id: kw.id },
                        data: { isUsed: true },
                      });
                    })
                    .catch((err) => {
                      this.logger.error(
                        `Automated sync failed for keyword ${kw.keyword} (${kw.id})`,
                        err.message,
                      );
                    });
                }

                // Mark description specifically separately if needed
                await this.prisma.visualDescription.update({
                  where: { id: description.id },
                  data: { status: "COMPLETED" },
                });
              } catch (err) {
                this.logger.error(
                  `Automated sync/matching failed for description ${description.id}`,
                  (err as Error).message,
                );
                await this.prisma.visualDescription.update({
                  where: { id: description.id },
                  data: { status: "FAILED" },
                });
              }
            } else {
              // If no auto-match, expansion for this description is COMPLETED
              await this.prisma.visualDescription.update({
                where: { id: description.id },
                data: { status: "COMPLETED" },
              });
            }
          }

          // Mark scene as completed
          await this.prisma.sceneIntent.update({
            where: { id: scene.id },
            data: { status: "COMPLETED" },
          });
        } catch (sceneError) {
          this.logger.error(`Failed to process scene ${index}`, sceneError);
          await this.prisma.sceneIntent.update({
            where: { id: scene.id },
            data: { status: "FAILED" },
          });
        }
      }

      // Mark the overall request as completed
      await this.prisma.visualIntentRequest.update({
        where: { id: request.id },
        data: { status: "COMPLETED" },
      });

      this.logger.log(
        `Successfully processed ${scenes.length} scenes for request ${request.id}`,
      );

      return scenes;
    } catch (error) {
      this.logger.error(
        "Visual intent extraction/persistence failed",
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
   * Sync Pexels library using keywords from a specific VisualDescription
   */
  async syncPexelsByDescriptionId(descriptionId: string): Promise<SyncResult> {
    this.logger.log(
      `Manual keyword-sync request for description ${descriptionId}`,
    );

    const description = await this.prisma.visualDescription.findUnique({
      where: { id: descriptionId },
      include: { keywords: { where: { isUsed: false } } },
    });

    if (!description) {
      throw new Error(`VisualDescription not found: ${descriptionId}`);
    }

    if (description.keywords.length === 0) {
      this.logger.warn(`No unused keywords for description ${descriptionId}`);
      return {
        total_images: 0,
        total_batches: 0,
        job_ids: [],
        status: "completed",
      };
    }

    this.logger.log(
      `Triggering manual sync for ${description.keywords.length} keywords of description ${descriptionId}`,
    );

    const syncResults = await Promise.all(
      description.keywords.map((kw) =>
        this.pexelsSyncService
          .syncPexelsLibrary(kw.keyword, 1000, 0.1, descriptionId, kw.id)
          .then(async (res) => {
            await this.prisma.visualDescriptionKeyword.update({
              where: { id: kw.id },
              data: { isUsed: true },
            });
            return res;
          }),
      ),
    );

    // Aggregate results for the API response
    return {
      total_images: syncResults.reduce((acc, r) => acc + r.total_images, 0),
      total_batches: syncResults.reduce((acc, r) => acc + r.total_batches, 0),
      job_ids: syncResults.flatMap((r) => r.job_ids),
      status: "completed",
    };
  }

  /**
   * Automatically sync Pexels for all descriptions that have unused keywords
   */
  async autoSyncUnusedKeywords(): Promise<{
    processed: number;
    results: any[];
  }> {
    this.logger.log("Checking for unused keywords to trigger auto-sync");

    // Find all descriptions that have at least one unused keyword
    const descriptionsWithUnusedKeywords =
      await this.prisma.visualDescription.findMany({
        where: {
          keywords: {
            some: {
              isUsed: false,
            },
          },
        },
        select: {
          id: true,
        },
      });

    if (descriptionsWithUnusedKeywords.length === 0) {
      this.logger.debug("No descriptions with unused keywords found");
      return { processed: 0, results: [] };
    }

    this.logger.log(
      `Found ${descriptionsWithUnusedKeywords.length} descriptions with unused keywords. Triggering sync...`,
    );

    const results = [];
    for (const desc of descriptionsWithUnusedKeywords) {
      try {
        const result = await this.syncPexelsByDescriptionId(desc.id);
        results.push({ descriptionId: desc.id, status: "success", result });
      } catch (error) {
        this.logger.error(
          `Auto-sync failed for description ${desc.id}`,
          (error as Error).message,
        );
        results.push({
          descriptionId: desc.id,
          status: "failed",
          error: (error as Error).message,
        });
      }
    }

    return {
      processed: descriptionsWithUnusedKeywords.length,
      results,
    };
  }

  /**
   * Orchestration: Resume stalled processing for various entities
   * This is used by cron jobs to recheck rows that haven't reached COMPLETED/FAILED
   */
  async resumeProcessing(
    entityType: "request" | "scene" | "description",
    id: string,
  ) {
    this.logger.log(`Resuming processing for ${entityType}: ${id}`);

    try {
      if (entityType === "request") {
        const request = await this.prisma.visualIntentRequest.findUnique({
          where: { id },
          select: { rawGeminiText: true },
        });
        if (request) {
          // Re-trigger extraction
          return this.extractVisualIntent({
            raw_gemini_text: request.rawGeminiText,
            auto_match: true,
          });
        }
      } else if (entityType === "scene") {
        const scene = await this.prisma.sceneIntent.findUnique({
          where: { id },
          select: { intent: true },
        });
        if (scene) {
          // Re-trigger expansion
          const expanded = await this.deepseekService.expandSceneIntent(
            scene.intent,
          );
          for (const exp of expanded) {
            const analysisData = exp.analysis as any;
            await this.prisma.visualDescription.create({
              data: {
                sceneIntentId: id,
                description: exp.description,
                status: "IN_PROGRESS",
                keywords: {
                  create:
                    analysisData?.keywords?.map((k: string) => ({
                      keyword: k,
                    })) || [],
                },
              },
            });
          }
          await this.prisma.sceneIntent.update({
            where: { id },
            data: { status: "COMPLETED" },
          });
        }
      } else if (entityType === "description") {
        return this.syncPexelsByDescriptionId(id);
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to resume ${entityType} ${id}: ${error.message}`,
      );
    }
  }

  /**
   * CRON: Process pending DeepSeek analysis jobs every 10 seconds
   * Finds completed Gemini analysis jobs that haven't been refined yet (isUsed: false)
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async processPendingDeepSeekAnalysis(limit = 5) {
    this.logger.debug(
      `Checking for pending DeepSeek analysis jobs (limit=${limit})...`,
    );

    try {
      // Find jobs that necessitate DeepSeek refinement
      // Criteria: Status=COMPLETED, isUsed=false, has rawResponse
      const pendingJobs = await this.prisma.imageAnalysisJob.findMany({
        where: {
          status: "COMPLETED",
          isUsed: false,
          rawResponse: { not: null },
        },
        select: { id: true, imageId: true },
        orderBy: { createdAt: "asc" }, // Process oldest first
        take: limit, // Process in small batches to avoid rate limits
      });

      if (pendingJobs.length === 0) {
        return;
      }

      this.logger.log(
        `Found ${pendingJobs.length} pending jobs for DeepSeek refinement. Processing...`,
      );

      for (const job of pendingJobs) {
        try {
          await this.geminiAnalysisService.refineWithDeepSeek(job.id);
        } catch (error) {
          this.logger.error(
            `Failed to auto-refine job ${job.id}`,
            (error as Error).message,
          );
          // Increment retry count or mark as failed? For now, we leave it retryable naturally
          // but we should probably avoid infinite loops if it consistently fails.
          // Consider checking retryCount in the query above.
        }
      }
    } catch (error) {
      this.logger.error(
        "Error in processPendingDeepSeekAnalysis cron",
        (error as Error).message,
      );
    }
  }

  /**
   * Health check / stats endpoint
   */
  async getStats() {
    try {
      const totalImages = await this.prisma.pexelsImage.count();
      const totalEmbeddings = await this.prisma.imageEmbedding.count();
      const pendingJobs = await this.prisma.imageAnalysisJob.count({
        where: { jobStatus: "QUEUED" },
      });
      const failedJobs = await this.prisma.imageAnalysisJob.count({
        where: { jobStatus: "FAILED" },
      });

      return {
        total_images: totalImages,
        total_embeddings: totalEmbeddings,
        pending_analysis_jobs: pendingJobs,
        failed_jobs: failedJobs,
        ready_for_search: totalEmbeddings,
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
