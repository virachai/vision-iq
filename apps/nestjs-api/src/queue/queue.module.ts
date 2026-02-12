import { Module } from "@nestjs/common";
import { QueueService } from "./queue.service";
import { ImageAnalysisModule } from "../image-analysis/image-analysis.module";

@Module({
	imports: [ImageAnalysisModule],
	providers: [QueueService],
	exports: [QueueService],
})
export class QueueModule {}
