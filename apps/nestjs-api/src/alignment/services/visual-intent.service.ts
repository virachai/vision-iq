import { Injectable, Logger } from "@nestjs/common";
import { DeepSeekService } from "../../deepseek-integration/deepseek.service";
import { GeminiAnalysisService } from "../../image-analysis/gemini-analysis.service";
import { VisualIntentRepository } from "../repositories/visual-intent.repository";
import { KeywordSyncService } from "./keyword-sync.service";
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
    private readonly keywordSyncService: KeywordSyncService,
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
          status: "PROCESSING" as PipelineStatus,
        }));

        const createdScenes = await this.sceneRepo.createScenes(sceneRecords);

        // 3. EXPANSION: Transform each raw intent into multiple detailed descriptions
        for (let i = 0; i < createdScenes.length; i++) {
          const scene = createdScenes[i];
          const sceneData = scenes[i]; // DeepSeek DTO has the intent

          await this.expandAndSyncScene(
            scene.id,
            sceneData.intent,
            dto.autoMatch,
          );
        }

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

  /**
   * Expand a single scene into many detailed descriptions and trigger auto-sync
   */
  async expandAndSyncScene(
    sceneId: string,
    intent: string,
    autoMatch = false,
  ): Promise<void> {
    this.logger.debug(
      `Expanding scene ${sceneId}: "${intent.substring(0, 30)}..."`,
    );

    try {
      const expanded = await this.deepseekService.expandSceneIntent(intent);

      for (const exp of expanded) {
        const analysisData = exp.analysis as any;
        const description = await this.sceneRepo.createDescription({
          sceneIntentId: sceneId,
          description: exp.description,
          status: "PROCESSING" as PipelineStatus,
          keywords: analysisData?.keywords || [],
        });

        if (autoMatch) {
          this.logger.log(
            `Auto-match triggered for expanded description: ${description.id}`,
          );
          // Fire and forget sync (orchestrated by KeywordSyncService)
          this.keywordSyncService
            .syncPexelsByDescriptionId(description.id)
            .catch((err) => {
              this.logger.error(
                `Background sync failed for description ${description.id}: ${err.message}`,
              );
            });
        } else {
          // If no auto-match, expansion for this description is COMPLETED
          await this.sceneRepo.updateDescriptionStatus(
            description.id,
            "COMPLETED",
          );
        }
      }

      // Mark scene as completed after expansion is triggered/done
      await this.sceneRepo.updateSceneStatus(sceneId, "COMPLETED");
    } catch (error: any) {
      this.logger.error(`Failed to expand scene ${sceneId}: ${error.message}`);
      await this.sceneRepo.updateSceneStatus(sceneId, "FAILED", error.message);
    }
  }
}
