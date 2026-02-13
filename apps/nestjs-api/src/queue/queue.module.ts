import { Module, forwardRef } from "@nestjs/common";
import { ImageAnalysisModule } from "../image-analysis/image-analysis.module";
import { QueueService } from "./queue.service";
import { PexelsIntegrationModule } from "../pexels-sync/pexels-integration.module";
import { AnalysisSchedulerService } from "./analysis-scheduler.service";

@Module({
  imports: [ImageAnalysisModule, forwardRef(() => PexelsIntegrationModule)],
  providers: [QueueService, AnalysisSchedulerService],
  exports: [QueueService],
})
export class QueueModule {}
