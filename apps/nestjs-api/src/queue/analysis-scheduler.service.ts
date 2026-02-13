import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaClient } from "@repo/database";
import { QueueService } from "./queue.service";

@Injectable()
export class AnalysisSchedulerService {
  private readonly logger = new Logger(AnalysisSchedulerService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly queueService: QueueService,
  ) {}

  /**
   * Cron job that runs every 5 minutes to recheck pending analysis jobs
   * and requeue them if they are not already in progress.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handlePendingJobs() {
    this.logger.log(
      "Running cron job: Checking for pending image analysis jobs",
    );

    try {
      // 1. Find jobs that are in PENDING status
      const pendingJobs = await this.prisma.imageAnalysisJob.findMany({
        where: {
          status: "PENDING",
        },
        include: {
          image: true,
        },
        take: 50, // Process in batches
      });

      if (pendingJobs.length === 0) {
        this.logger.debug("No pending jobs found");
        return;
      }

      this.logger.log(
        `Found ${pendingJobs.length} pending jobs. Re-queueing...`,
      );

      for (const job of pendingJobs) {
        try {
          // 2. Re-queue the job
          // BullMQ will handle deduplication if jobId is set (which it is in queueService)
          await this.queueService.queueImageAnalysis(
            job.imageId,
            job.image.url,
            job.image.pexelsId,
          );

          this.logger.debug(
            `Successfully re-queued analysis for image ${job.image.pexelsId}`,
          );
        } catch (queueError: any) {
          this.logger.error(
            `Failed to re-queue job for image ${job.imageId}: ${queueError.message}`,
          );
        }
      }
    } catch (error: any) {
      this.logger.error("Error in handlePendingJobs cron:", error.message);
    }
  }
}
