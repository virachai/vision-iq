import { Module, forwardRef } from "@nestjs/common";
import { DeepSeekModule } from "../deepseek-integration/deepseek.module";
import { ImageAnalysisModule } from "../image-analysis/image-analysis.module";
import { PexelsIntegrationModule } from "../pexels-sync/pexels-integration.module";
import { QueueModule } from "../queue/queue.module";
import { SemanticMatchingModule } from "../semantic-matching/semantic-matching.module";
import { AlignmentController } from "./alignment.controller";
import { AlignmentService } from "./alignment.service";

@Module({
  imports: [
    DeepSeekModule,
    SemanticMatchingModule,
    PexelsIntegrationModule,
    forwardRef(() => QueueModule),
    ImageAnalysisModule,
  ],
  controllers: [AlignmentController],
  providers: [AlignmentService],
  exports: [AlignmentService],
})
export class AlignmentModule {}
