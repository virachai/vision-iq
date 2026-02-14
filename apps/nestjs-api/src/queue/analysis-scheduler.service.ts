import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaClient } from "@repo/database";
import { QueueService } from "./queue.service";
import { AlignmentService } from "../alignment/alignment.service";

@Injectable()
export class AnalysisSchedulerService {
  private readonly logger = new Logger(AnalysisSchedulerService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly queueService: QueueService,
    private readonly alignmentService: AlignmentService,
  ) {}

  /**
   * Cron job that runs every 5 minutes to trigger Pexels sync
   * for VisualDescriptions that have unused keywords.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleUnusedKeywords() {
    this.logger.log("Running cron job: Checking for unused keywords to sync");
    try {
      const result = await this.alignmentService.autoSyncUnusedKeywords();
      if (result.processed > 0) {
        this.logger.log(
          `Auto-sync triggered for ${result.processed} descriptions`,
        );
      }
    } catch (error: any) {
      this.logger.error("Error in handleUnusedKeywords cron:", error.message);
    }
  }

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
          jobStatus: "QUEUED",
          retryCount: { lt: 10 }, // Max 10 re-queues
        },
        include: {
          pexelsImage: true,
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
            job.pexelsImageId,
            job.pexelsImage.url,
            job.pexelsImage.pexelsImageId,
            job.pexelsImage.alt,
          );

          this.logger.debug(
            `Successfully re-queued analysis for image ${job.pexelsImage.pexelsImageId}`,
          );
        } catch (queueError: any) {
          this.logger.error(
            `Failed to re-queue job for image ${job.pexelsImageId}: ${queueError.message}`,
          );
        }
      }
    } catch (error: any) {
      this.logger.error("Error in handlePendingJobs cron:", error.message);
    }
  }

  /**
   * Cron job that runs every 10 minutes to recheck stalled orchestration steps
   * (VisualIntentRequest, SceneIntent, VisualDescription)
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleStalledOrchestration() {
    this.logger.log(
      "Running cron job: Checking for stalled orchestration steps",
    );

    const stalledThreshold = new Date();
    stalledThreshold.setMinutes(stalledThreshold.getMinutes() - 15);

    try {
      // 1. Stalled VisualIntentRequests
      const stalledRequests = await this.prisma.visualIntentRequest.findMany({
        where: {
          status: { in: ["PENDING", "PROCESSING"] },
          retryCount: { lt: 3 }, // Ceiling for stalled resumes
          updatedAt: { lt: stalledThreshold },
        },
        select: { id: true },
      });

      for (const req of stalledRequests) {
        await this.alignmentService.resumeProcessing("request", req.id);
      }

      // 2. Stalled SceneIntents
      const stalledScenes = await this.prisma.sceneIntent.findMany({
        where: {
          status: { in: ["PENDING", "PROCESSING"] },
          retryCount: { lt: 3 }, // Ceiling for stalled resumes
          updatedAt: { lt: stalledThreshold },
        },
        select: { id: true },
      });

      for (const scene of stalledScenes) {
        await this.alignmentService.resumeProcessing("scene", scene.id);
      }

      // 3. Stalled VisualDescriptions
      const stalledDescriptions = await this.prisma.visualDescription.findMany({
        where: {
          status: { in: ["PENDING", "PROCESSING"] },
          retryCount: { lt: 3 }, // Ceiling for stalled resumes
          updatedAt: { lt: stalledThreshold },
        },
        select: { id: true },
      });

      for (const desc of stalledDescriptions) {
        await this.alignmentService.resumeProcessing("description", desc.id);
      }

      if (
        stalledRequests.length > 0 ||
        stalledScenes.length > 0 ||
        stalledDescriptions.length > 0
      ) {
        this.logger.log(
          `Resumed ${stalledRequests.length} requests, ${stalledScenes.length} scenes, and ${stalledDescriptions.length} descriptions.`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        "Error in handleStalledOrchestration cron:",
        error.message,
      );
    }
  }
}
