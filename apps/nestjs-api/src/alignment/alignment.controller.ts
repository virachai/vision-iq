import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { AlignmentService } from "./alignment.service";
import { CleanupService } from "./cleanup.service";
import type {
  ExtractVisualIntentDto,
  FindAlignedImagesDto,
  ImageMatch,
  SceneIntentDto,
} from "./dto/scene-intent.dto";
import { SyncPexelsDto, TestAnalysisDto } from "./dto/alignment-actions.dto";

@Controller("alignment")
export class AlignmentController {
  constructor(
    private readonly alignmentService: AlignmentService,
    private readonly cleanupService: CleanupService,
  ) {}

  /**
   * POST /alignment/extract-visual-intent
   * Extract scene visual intents from raw Gemini Live text
   */
  @Post("extract-visual-intent")
  async extractVisualIntent(
    @Body() dto: ExtractVisualIntentDto,
  ): Promise<SceneIntentDto[]> {
    return this.alignmentService.extractVisualIntent(dto);
  }

  /**
   * POST /alignment/test-analysis
   * Direct test for Gemini Image Analysis
   */
  @Post("test-analysis")
  async testAnalysis(@Body() dto: TestAnalysisDto) {
    return this.alignmentService.testImageAnalysis(dto.imageUrl);
  }

  /**
   * POST /alignment/refine-analysis/:jobId
   * Refine an existing analysis job using DeepSeek
   */
  @Post("refine-analysis/:jobId")
  async refineAnalysis(@Param("jobId") jobId: string) {
    return this.alignmentService.refineAnalysis(jobId);
  }

  /**
   * POST /alignment/find-images
   * Find semantically aligned images for a sequence of scenes
   */
  @Post("find-images")
  async findAlignedImages(
    @Body() dto: FindAlignedImagesDto,
  ): Promise<ImageMatch[][]> {
    return this.alignmentService.findAlignedImages(dto);
  }

  /**
   * POST /alignment/sync-pexels
   * Trigger Pexels library sync
   * Body: { search_query?: string, batch_size?: number }
   */
  @Post("sync-pexels")
  async syncPexels(@Body() dto: SyncPexelsDto) {
    return this.alignmentService.syncPexelsLibrary(
      dto.searchQuery,
      dto.batchSize,
    );
  }

  /**
   * POST /alignment/sync-pexels/:descriptionId
   * Trigger keyword-based sync for a specific description
   */
  @Post("sync-pexels/:descriptionId")
  async syncPexelsByDescription(@Param("descriptionId") descriptionId: string) {
    return this.alignmentService.syncPexelsByDescriptionId(descriptionId);
  }

  /**
   * POST /alignment/trigger-keyword-sync
   * Manually trigger the automated sync flow for all descriptions with unused keywords
   */
  @Post("trigger-keyword-sync")
  async triggerKeywordSync() {
    return this.alignmentService.autoSyncUnusedKeywords();
  }

  /**
   * GET /alignment/stats
   * Get sync and analysis statistics
   */
  @Get("stats")
  async getStats() {
    return this.alignmentService.getStats();
  }

  /**
   * POST /alignment/rollback/:requestId
   * Rollback a visual intent request and all its downstream entities
   */
  @Post("rollback/:requestId")
  async rollback(@Param("requestId") requestId: string) {
    return this.cleanupService.rollbackRequest(requestId);
  }
}
