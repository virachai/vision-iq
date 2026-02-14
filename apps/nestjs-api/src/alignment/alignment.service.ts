import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { VisualIntentService } from "./services/visual-intent.service";
import { SceneAlignmentService } from "./services/scene-alignment.service";
import { KeywordSyncService } from "./services/keyword-sync.service";
import { RefinementService } from "./services/refinement.service";
import { VisualIntentRepository } from "./repositories/visual-intent.repository";
import { SceneRepository } from "./repositories/scene.repository";
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
    private readonly visualIntentService: VisualIntentService,
    private readonly sceneAlignmentService: SceneAlignmentService,
    private readonly keywordSyncService: KeywordSyncService,
    private readonly refinementService: RefinementService,
    private readonly visualIntentRepo: VisualIntentRepository,
    private readonly sceneRepo: SceneRepository,
  ) {
    this.logger.log("AlignmentService initialized as facade.");
  }

  /**
   * Extract visual intents from raw Gemini Live text
   */
  async extractVisualIntent(
    dto: ExtractVisualIntentDto,
  ): Promise<SceneIntentDto[]> {
    return this.visualIntentService.extractVisualIntent(dto);
  }

  /**
   * Direct test for Gemini Image Analysis
   */
  async testImageAnalysis(imageUrl: string) {
    return this.visualIntentService.testImageAnalysis(imageUrl);
  }

  /**
   * Refine an existing analysis job using DeepSeek
   */
  async refineAnalysis(jobId: string) {
    return this.refinementService.refineAnalysis(jobId);
  }

  /**
   * Orchestration: Find aligned images for multiple scene intents
   */
  async findAlignedImages(dto: FindAlignedImagesDto): Promise<ImageMatch[][]> {
    return this.sceneAlignmentService.findAlignedImages(dto);
  }

  /**
   * Manual trigger for full library sync
   */
  async syncPexelsLibrary(
    search_query = "nature",
    batchSize = 50,
    failureThreshold = 0.1,
  ): Promise<SyncResult> {
    return this.keywordSyncService.syncPexelsLibrary(
      search_query,
      batchSize,
      failureThreshold,
    );
  }

  /**
   * Sync Pexels library using keywords from a specific VisualDescription
   */
  async syncPexelsByDescriptionId(descriptionId: string): Promise<SyncResult> {
    return this.keywordSyncService.syncPexelsByDescriptionId(descriptionId);
  }

  /**
   * Automatically sync Pexels for all descriptions that have unused keywords
   */
  async autoSyncUnusedKeywords(): Promise<{
    processed: number;
    results: any[];
  }> {
    return this.keywordSyncService.autoSyncUnusedKeywords();
  }

  /**
   * Orchestration: Resume stalled processing for various entities
   */
  async resumeProcessing(
    entityType: "request" | "scene" | "description",
    id: string,
  ) {
    this.logger.log(`Resuming processing for ${entityType}: ${id}`);

    try {
      if (entityType === "request") {
        const request = await this.visualIntentRepo.findRequestById(id);
        if (request) {
          return this.extractVisualIntent({
            rawGeminiText: request.rawGeminiText,
            autoMatch: true,
          });
        }
      } else if (entityType === "scene") {
        const scene = await this.sceneRepo.findSceneById(id);
        if (scene) {
          this.logger.warn(
            `Resume logic for scene ${id} delegated to repositories (placeholder)`,
          );
          // Note: Full logic for scene expansion could be moved to a SceneService if needed
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
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async processPendingDeepSeekAnalysis() {
    if (process.env.ENABLE_ANALYSIS_CRON === "false") {
      // Shush logger for this very frequent cron job
      return;
    }
    await this.refinementService.processPendingDeepSeekAnalysis();
  }

  /**
   * Health check / stats endpoint
   */
  async getStats() {
    return this.visualIntentRepo.getStats();
  }
}
