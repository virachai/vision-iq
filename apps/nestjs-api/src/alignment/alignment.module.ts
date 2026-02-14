import { Module, forwardRef } from "@nestjs/common";
import { DeepSeekModule } from "../deepseek-integration/deepseek.module";
import { ImageAnalysisModule } from "../image-analysis/image-analysis.module";
import { PexelsIntegrationModule } from "../pexels-sync/pexels-integration.module";
import { QueueModule } from "../queue/queue.module";
import { SemanticMatchingModule } from "../semantic-matching/semantic-matching.module";
import { AlignmentController } from "./alignment.controller";
import { AlignmentService } from "./alignment.service";
import { CleanupService } from "./cleanup.service";
import { VisualIntentRepository } from "./repositories/visual-intent.repository";
import { SceneRepository } from "./repositories/scene.repository";
import { VisualIntentService } from "./services/visual-intent.service";
import { SceneAlignmentService } from "./services/scene-alignment.service";
import { KeywordSyncService } from "./services/keyword-sync.service";
import { RefinementService } from "./services/refinement.service";

@Module({
  imports: [
    DeepSeekModule,
    SemanticMatchingModule,
    PexelsIntegrationModule,
    forwardRef(() => QueueModule),
    ImageAnalysisModule,
  ],
  controllers: [AlignmentController],
  providers: [
    AlignmentService,
    CleanupService,
    VisualIntentRepository,
    SceneRepository,
    VisualIntentService,
    SceneAlignmentService,
    KeywordSyncService,
    RefinementService,
  ],
  exports: [
    AlignmentService,
    CleanupService,
    VisualIntentService,
    SceneAlignmentService,
    KeywordSyncService,
    RefinementService,
  ],
})
export class AlignmentModule {}
