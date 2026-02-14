import { Injectable, Logger } from "@nestjs/common";
import { DeepSeekService } from "../../deepseek-integration/deepseek.service";
import { GeminiAnalysisService } from "../../image-analysis/gemini-analysis.service";
import { VisualIntentRepository } from "../repositories/visual-intent.repository";
import { SceneRepository } from "../repositories/scene.repository";
import {
  ExtractVisualIntentDto,
  SceneIntentDto,
} from "../dto/scene-intent.dto";
import { PipelineStatus } from "@repo/database";

@Injectable()
export class VisualIntentService {
  private readonly logger = new Logger(VisualIntentService.name);

  constructor(
    private readonly deepseekService: DeepSeekService,
    private readonly geminiAnalysisService: GeminiAnalysisService,
    private readonly visualIntentRepo: VisualIntentRepository,
    private readonly sceneRepo: SceneRepository,
  ) {}

  async testImageAnalysis(imageUrl: string) {
    this.logger.debug(`Direct test analysis for: ${imageUrl}`);
    return this.geminiAnalysisService.analyzeImage(imageUrl);
  }

  async extractVisualIntent(
    dto: ExtractVisualIntentDto,
  ): Promise<SceneIntentDto[]> {
    this.logger.debug(
      `Extracting visual intent from raw text (${dto.rawGeminiText.length} chars)`,
    );

    try {
      const request = await this.visualIntentRepo.createRequest(
        dto.rawGeminiText,
      );

      try {
        const scenes = await this.deepseekService.extractVisualIntent(
          dto.rawGeminiText,
        );

        if (!Array.isArray(scenes) || scenes.length === 0) {
          throw new Error("DeepSeek returned no valid scenes");
        }

        const sceneRecords = scenes.map((sceneData, index) => ({
          visualIntentRequestId: request.id,
          sceneIndex: index,
          intent: sceneData.intent,
          requiredImpact: sceneData.requiredImpact,
          composition: {
            ...(sceneData.preferredComposition as any),
            visual_intent: sceneData.visualIntent,
          },
          status: "COMPLETED" as PipelineStatus, // Initial extraction is done
        }));

        await this.sceneRepo.createScenes(sceneRecords);
        await this.visualIntentRepo.updateRequestStatus(
          request.id,
          "COMPLETED",
        );

        return scenes;
      } catch (error: any) {
        await this.visualIntentRepo.updateRequestStatus(
          request.id,
          "FAILED",
          error.message,
        );
        throw error;
      }
    } catch (error: any) {
      this.logger.error(`Failed to extract visual intent: ${error.message}`);
      throw error;
    }
  }
}
