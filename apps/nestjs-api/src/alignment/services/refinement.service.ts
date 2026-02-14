import { Injectable, Logger } from "@nestjs/common";
import { GeminiAnalysisService } from "../../image-analysis/gemini-analysis.service";
import { SceneRepository } from "../repositories/scene.repository";

@Injectable()
export class RefinementService {
  private readonly logger = new Logger(RefinementService.name);

  constructor(
    private readonly geminiAnalysisService: GeminiAnalysisService,
    private readonly sceneRepo: SceneRepository,
  ) {}

  async refineAnalysis(jobId: string) {
    this.logger.log(`Manually triggering refinement for job ${jobId}`);
    return this.geminiAnalysisService.refineWithDeepSeek(jobId);
  }

  async processPendingDeepSeekAnalysis(limit = 5) {
    if (!this.geminiAnalysisService.isDeepSeekRefinementEnabled()) {
      this.logger.debug(
        "Skipping processPendingDeepSeekAnalysis: DeepSeek is disabled",
      );
      return;
    }
    this.logger.debug(
      `Checking for pending DeepSeek analysis jobs (limit=${limit})...`,
    );

    try {
      const pendingJobs = await this.sceneRepo.findPendingAnalysisJobs(limit);

      if (pendingJobs.length === 0) {
        return;
      }

      this.logger.log(
        `Found ${pendingJobs.length} pending jobs for DeepSeek refinement. Processing...`,
      );

      for (const job of pendingJobs) {
        try {
          await this.geminiAnalysisService.refineWithDeepSeek(job.id);
        } catch (error: any) {
          this.logger.error(
            `Failed to auto-refine job ${job.id}: ${error.message}`,
          );
          await this.sceneRepo.updateAnalysisJobRetry(job.id, error.message);
        }
      }
    } catch (error: any) {
      this.logger.error(
        `Error in processPendingDeepSeekAnalysis: ${error.message}`,
      );
    }
  }
}
