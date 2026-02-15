import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { PrismaClient } from "@repo/database";
import { PRISMA_SERVICE } from "../prisma/prisma.module";
import { PexelsIntegrationService } from "./pexels-integration.service";
import { QueueService } from "../queue/queue.service";
import type { SyncResult } from "../shared/pipeline-types";

// Re-export for backward compatibility
export type { SyncResult } from "../shared/pipeline-types";

@Injectable()
export class PexelsSyncService {
  private readonly logger = new Logger(PexelsSyncService.name);

  constructor(
    private readonly pexelsIntegrationService: PexelsIntegrationService,
    @Inject(forwardRef(() => QueueService))
    private readonly queueService: QueueService,
    @Inject(PRISMA_SERVICE) private readonly prisma: PrismaClient,
  ) {}

  /**
   * Sync Pexels library in batches
   */
  async syncPexelsLibrary(
    searchQuery = "nature",
    batchSize = 50,
    failureThreshold = 0.1,
    descriptionId?: string,
    keywordId?: string,
  ): Promise<SyncResult> {
    const result: SyncResult = {
      total_images: 0,
      total_batches: 0,
      job_ids: [],
      status: "in_progress",
      errors: [],
    };

    // If keywordId is not provided, we might need a fallback or skip history creation
    // For now, we only create history if keywordId is provided to avoid FK violation
    let syncHistoryId: string | undefined;
    if (keywordId) {
      const syncHistory = await this.prisma.pexelsSyncHistory.create({
        data: {
          keywordId: keywordId,
          syncStatus: "PROCESSING", // Start as processing
          syncAttempt: 1,
        },
      });
      syncHistoryId = syncHistory.id;
    }

    try {
      this.logger.log(
        `Starting Pexels sync (ID: ${
          syncHistoryId || "no-history"
        }): query="${searchQuery}", batchSize=${batchSize}`,
      );

      for await (const batch of this.pexelsIntegrationService.syncPexelsLibrary(
        searchQuery,
        batchSize,
      )) {
        result.total_batches = batch.total_batches;

        try {
          const jobIds = await this.ingestionBatch(
            batch.images,
            syncHistoryId,
            descriptionId,
            keywordId,
          );
          result.job_ids.push(...jobIds);
          result.total_images += batch.images.length;

          if (syncHistoryId) {
            // Update history with progress
            await this.prisma.pexelsSyncHistory.update({
              where: { id: syncHistoryId },
              data: {
                // totalImages: result.total_images,
                // totalBatches: result.total_batches,
                // jobIds: result.job_ids,
              },
            });
          }

          this.logger.log(
            `Processed batch ${batch.batch_number}/${batch.total_batches} (${batch.images.length} images)`,
          );
        } catch (batchError) {
          const failedCount = batch.images.length;
          const failureRate = failedCount / batch.images.length;

          this.logger.error(
            `Batch ${batch.batch_number} failed: ${
              (batchError as Error).message
            }`,
          );

          result.errors?.push(
            `Batch ${batch.batch_number}: ${(batchError as Error).message}`,
          );

          if (failureRate > failureThreshold) {
            if (syncHistoryId) {
              result.status = "failed";
              await this.prisma.pexelsSyncHistory.update({
                where: { id: syncHistoryId },
                data: {
                  syncStatus: "FAILED",
                  errorMessage: (batchError as Error).message,
                },
              });
            }
            throw new Error(
              `Batch failure rate (${failureRate * 100}%) exceeds threshold`,
            );
          }
        }
      }

      result.status = "queued";
      result.total_images = result.job_ids.length;

      if (syncHistoryId) {
        // Mark history as completed
        await this.prisma.pexelsSyncHistory.update({
          where: { id: syncHistoryId },
          data: {
            syncStatus: "COMPLETED",
            syncedAt: new Date(),
          },
        });

        // ALSO: Mark the keyword as used
        if (keywordId) {
          await this.prisma.visualDescriptionKeyword.update({
            where: { id: keywordId },
            data: { isUsed: true }, // Keep isUsed for search tracking
          });
        }
      }

      return result;
    } catch (error) {
      result.status = "failed";
      result.errors?.push((error as Error).message);
      this.logger.error("Pexels sync failed", (error as Error).message);

      // Final update for error status
      if (syncHistoryId) {
        await this.prisma.pexelsSyncHistory.update({
          where: { id: syncHistoryId },
          data: {
            syncStatus: "FAILED",
            errorMessage: (error as Error).message,
          },
        });
      }

      throw error;
    }
  }

  /**
   * Ingest a batch of images into the database
   */
  private async ingestionBatch(
    images: Array<any>,
    syncHistoryId: string | undefined,
    descriptionId?: string,
    keywordId?: string,
  ): Promise<string[]> {
    const jobIds: string[] = [];
    void descriptionId;
    void keywordId;

    for (const image of images) {
      try {
        const result = await this.prisma.$transaction(async (tx) => {
          const pexelsImage = await tx.pexelsImage.upsert({
            where: { pexelsImageId: image.pexels_id },
            update: {
              ...(syncHistoryId ? { syncHistoryId } : {}),
            },
            create: {
              syncHistoryId: syncHistoryId || "manual-sync-placeholder",
              pexelsImageId: image.pexels_id,
              url: image.url,
              photographer: image.photographer,
              width: image.width,
              height: image.height,
              avgColor: image.avg_color,
              alt: image.alt,
            },
          });

          // Check if image already has analysis data
          const existingJob = await tx.imageAnalysisJob.findUnique({
            where: { pexelsImageId: pexelsImage.id },
            include: {
              deepseekAnalysis: true,
              pexelsImage: {
                include: {
                  visualIntentAnalysis: true,
                },
              },
            },
          });

          const hasAnalysis =
            existingJob?.jobStatus === "COMPLETED" ||
            existingJob?.deepseekAnalysis ||
            existingJob?.pexelsImage?.visualIntentAnalysis;

          if (hasAnalysis) {
            this.logger.log(
              `Skipping analysis for ${image.pexels_id} - already analyzed`,
            );
            return { shouldQueue: false, pexelsImage };
          }

          // Create or reset analysis job
          await tx.imageAnalysisJob.upsert({
            where: { pexelsImageId: pexelsImage.id },
            update: {
              jobStatus: "QUEUED",
              retryCount: 0,
            },
            create: {
              pexelsImageId: pexelsImage.id,
              jobStatus: "QUEUED",
              provider: "DEEPSEEK",
              retryCount: 0,
            },
          });

          return { shouldQueue: true, pexelsImage };
        });

        if (result && result.shouldQueue) {
          const queueJobId = await this.queueService.queueImageAnalysis(
            result.pexelsImage.id,
            image.url,
            image.pexels_id,
            image.alt,
          );
          jobIds.push(queueJobId);
        }
      } catch (imageError) {
        this.logger.warn(
          `Failed to ingest image ${image.pexels_id}: ${
            (imageError as Error).message
          }`,
        );
      }
    }

    return jobIds;
  }
}
