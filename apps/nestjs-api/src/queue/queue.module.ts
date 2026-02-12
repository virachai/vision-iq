import { Module } from "@nestjs/common";
import { ImageAnalysisModule } from "../image-analysis/image-analysis.module";
import { QueueService } from "./queue.service";

@Module({
	imports: [ImageAnalysisModule],
	providers: [QueueService],
	exports: [QueueService],
})
export class QueueModule {}
