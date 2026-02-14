import { Injectable, Logger } from "@nestjs/common";
import { SemanticMatchingService } from "../../semantic-matching/semantic-matching.service";
import { SceneRepository } from "../repositories/scene.repository";
import {
  FindAlignedImagesDto,
  ImageMatch,
  SceneIntentDto,
} from "../dto/scene-intent.dto";

@Injectable()
export class SceneAlignmentService {
  private readonly logger = new Logger(SceneAlignmentService.name);

  constructor(
    private readonly semanticMatchingService: SemanticMatchingService,
    private readonly sceneRepo: SceneRepository,
  ) {}

  async findAlignedImages(dto: FindAlignedImagesDto): Promise<ImageMatch[][]> {
    this.logger.debug(`Finding aligned images for ${dto.scenes.length} scenes`);

    // Logic from AlignmentService.findAlignedImages
    // Delegate to SemanticMatchingService which handles the ranking and search
    return this.semanticMatchingService.findAlignedImages(
      dto.scenes,
      dto.topK || 5,
      dto.moodConsistencyWeight || 1.0,
    );
  }
}
