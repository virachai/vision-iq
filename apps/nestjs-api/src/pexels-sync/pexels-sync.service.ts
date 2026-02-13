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
    search_query = "nature",
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

    const syncHistory = await this.prisma.pexelsSyncHistory.create({
      data: {
        searchQuery: search_query,
        batchSize: batchSize,
        status: "pending",
        descriptionId: descriptionId,
        keywordId: keywordId,
      },
    });

    try {
      this.logger.log(
        `Starting Pexels sync (ID: ${syncHistory.id}): query="${search_query}", batchSize=${batchSize}`,
      );

      for await (const batch of this.pexelsIntegrationService.syncPexelsLibrary(
        search_query,
        batchSize,
      )) {
        result.total_batches = batch.total_batches;

        try {
          const jobIds = await this.ingestionBatch(
            batch.images,
            descriptionId,
            keywordId,
          );
          result.job_ids.push(...jobIds);
          result.total_images += batch.images.length;

          // Update history with progress
          await this.prisma.pexelsSyncHistory.update({
            where: { id: syncHistory.id },
            data: {
              totalImages: result.total_images,
              totalBatches: result.total_batches,
              jobIds: result.job_ids,
            },
          });

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
            result.status = "failed";
            await this.prisma.pexelsSyncHistory.update({
              where: { id: syncHistory.id },
              data: {
                status: "failed",
                error: (batchError as Error).message,
              },
            });
            throw new Error(
              `Batch failure rate (${failureRate * 100}%) exceeds threshold`,
            );
          }
        }
      }

      result.status = "queued";
      result.total_images = result.job_ids.length;

      // Mark history as completed
      await this.prisma.pexelsSyncHistory.update({
        where: { id: syncHistory.id },
        data: {
          status: "completed",
          totalImages: result.total_images,
        },
      });

      return result;
    } catch (error) {
      result.status = "failed";
      result.errors?.push((error as Error).message);
      this.logger.error("Pexels sync failed", (error as Error).message);

      // Final update for error status
      await this.prisma.pexelsSyncHistory.update({
        where: { id: syncHistory.id },
        data: {
          status: "failed",
          error: (error as Error).message,
        },
      });

      throw error;
    }
  }

  /**
   * Ingest a batch of images into the database
   */
  private async ingestionBatch(
    images: Array<any>,
    descriptionId?: string,
    keywordId?: string,
  ): Promise<string[]> {
    const jobIds: string[] = [];

    for (const image of images) {
      try {
        const pexelsImage = await this.prisma.pexelsImage.upsert({
          where: { pexelsId: image.pexels_id },
          update: {},
          create: {
            pexelsId: image.pexels_id,
            url: image.url,
            photographer: image.photographer,
            width: image.width,
            height: image.height,
            avgColor: image.avg_color,
            alt: image.alt,
          },
        });

        // Track provenance if descriptionId provided
        if (descriptionId) {
          await this.prisma.pexelsImageDescription.upsert({
            where: {
              descriptionId_pexelsImageId: {
                descriptionId: descriptionId,
                pexelsImageId: pexelsImage.id,
              },
            },
            update: {},
            create: {
              descriptionId: descriptionId,
              pexelsImageId: pexelsImage.id,
              keywordId: keywordId,
              discoveryMethod: "SEARCH",
            },
          });
        }

        // Create or reset analysis job
        await this.prisma.imageAnalysisJob.upsert({
          where: { imageId: pexelsImage.id },
          update: {
            status: "PENDING",
            retryCount: 0,
            errorMessage: null,
          },
          create: {
            imageId: pexelsImage.id,
            status: "PENDING",
            retryCount: 0,
          },
        });

        const queueJobId = await this.queueService.queueImageAnalysis(
          pexelsImage.id,
          image.url,
          image.pexels_id,
          image.alt,
        );

        jobIds.push(queueJobId);
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
