import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { PrismaClient } from "@repo/database";
import { PRISMA_SERVICE } from "../prisma/prisma.module";
import { PexelsIntegrationService } from "./pexels-integration.service";
import { QueueService } from "../queue/queue.service";

export interface SyncResult {
  total_images: number;
  total_batches: number;
  job_ids: string[];
  status: "queued" | "in_progress" | "completed" | "failed";
  errors?: string[];
}

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

      for await (const batch of this.pexelsIntegrationService.syncPexelsLibrary(
        search_query,
        batchSize,
      )) {
        result.total_batches = batch.total_batches;

        try {
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
            `Batch ${batch.batch_number} failed: ${
              (batchError as Error).message
            }`,
          );

          result.errors?.push(
            `Batch ${batch.batch_number}: ${(batchError as Error).message}`,
          );

          if (failureRate > failureThreshold) {
            result.status = "failed";
            throw new Error(
              `Batch failure rate (${failureRate * 100}%) exceeds threshold`,
            );
          }
        }
      }

      result.status = "queued";
      result.total_images = result.job_ids.length;
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
   */
  private async ingestionBatch(images: Array<any>): Promise<string[]> {
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
          },
        });

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
