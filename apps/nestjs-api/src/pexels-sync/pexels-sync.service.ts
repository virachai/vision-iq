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
   * Sync Pexels library in batches.
   * Supports resuming from a previously stalled sync via `resumeSyncHistoryId`.
   */
  async syncPexelsLibrary(
    searchQuery = "nature",
    batchSize = 50,
    failureThreshold = 0.1,
    descriptionId?: string,
    keywordId?: string,
    resumeSyncHistoryId?: string,
  ): Promise<SyncResult> {
    const result: SyncResult = {
      total_images: 0,
      total_batches: 0,
      job_ids: [],
      status: "in_progress",
      errors: [],
    };

    let syncHistoryId: string | undefined;
    let startPage = 1;

    // Resume path: reuse existing sync history and start from last page
    if (resumeSyncHistoryId) {
      const existing = await this.prisma.pexelsSyncHistory.findUnique({
        where: { id: resumeSyncHistoryId },
      });
      if (existing) {
        syncHistoryId = existing.id;
        startPage = (existing.lastPageSynced ?? 0) + 1;
        keywordId = keywordId || existing.keywordId;
        this.logger.log(
          `Resuming sync ${syncHistoryId} from page ${startPage} (attempt ${existing.syncAttempt})`,
        );
        // Update status back to PROCESSING for this resume attempt
        await this.prisma.pexelsSyncHistory.update({
          where: { id: syncHistoryId },
          data: { syncStatus: "PROCESSING", errorMessage: null },
        });
      }
    }

    // New sync path: check for existing sync history before creating to avoid duplicates
    if (!syncHistoryId && keywordId) {
      const existing = await this.prisma.pexelsSyncHistory.findFirst({
        where: { keywordId },
        orderBy: { createdAt: "desc" },
      });

      if (existing) {
        syncHistoryId = existing.id;
        startPage = (existing.lastPageSynced ?? 0) + 1;
        this.logger.log(
          `Found existing sync history ${syncHistoryId} for keyword ${keywordId}. Resuming from page ${startPage} (attempt ${
            existing.syncAttempt + 1
          })`,
        );
        // Update status and increment attempt counts
        await this.prisma.pexelsSyncHistory.update({
          where: { id: syncHistoryId },
          data: {
            syncStatus: "PROCESSING",
            errorMessage: null,
            syncAttempt: { increment: 1 },
          },
        });
      } else {
        const syncHistory = await this.prisma.pexelsSyncHistory.create({
          data: {
            keywordId: keywordId,
            syncStatus: "PROCESSING",
            syncAttempt: 1,
          },
        });
        syncHistoryId = syncHistory.id;
      }
    }

    try {
      this.logger.log(
        `Starting Pexels sync (ID: ${
          syncHistoryId || "no-history"
        }): query="${searchQuery}", batchSize=${batchSize}, startPage=${startPage}`,
      );

      for await (const batch of this.pexelsIntegrationService.syncPexelsLibrary(
        searchQuery,
        batchSize,
        startPage,
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

          // Track page-level progress after each successful batch
          if (syncHistoryId) {
            await this.prisma.pexelsSyncHistory.update({
              where: { id: syncHistoryId },
              data: {
                lastPageSynced: batch.batch_number,
                totalPages: batch.total_batches,
                totalImages: { increment: batch.images.length },
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

        // Mark the keyword as used
        if (keywordId) {
          await this.prisma.visualDescriptionKeyword.update({
            where: { id: keywordId },
            data: { isUsed: true },
          });
        }
      }

      return result;
    } catch (error) {
      result.status = "failed";
      result.errors?.push((error as Error).message);
      this.logger.error("Pexels sync failed", (error as Error).message);

      // Guaranteed: update error status even on unexpected errors
      if (syncHistoryId) {
        try {
          await this.prisma.pexelsSyncHistory.update({
            where: { id: syncHistoryId },
            data: {
              syncStatus: "FAILED",
              errorMessage: (error as Error).message,
            },
          });
        } catch (updateError) {
          this.logger.error(
            `Failed to update sync history status to FAILED: ${
              (updateError as Error).message
            }`,
          );
        }
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
