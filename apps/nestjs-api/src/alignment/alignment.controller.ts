import { Body, Controller, Get, Post } from "@nestjs/common";
import { AlignmentService } from "./alignment.service";
import type {
  ExtractVisualIntentDto,
  FindAlignedImagesDto,
  ImageMatch,
  SceneIntentDto,
} from "./dto/scene-intent.dto";

@Controller("alignment")
export class AlignmentController {
  constructor(private readonly alignmentService: AlignmentService) {}

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
  async syncPexels(
    @Body() body: { search_query?: string; batch_size?: number } = {},
  ) {
    const { search_query = "nature", batch_size = 50 } = body;
    return this.alignmentService.syncPexelsLibrary(search_query, batch_size);
  }

  /**
   * GET /alignment/stats
   * Get sync and analysis statistics
   */
  @Get("stats")
  async getStats() {
    return this.alignmentService.getStats();
  }
}
