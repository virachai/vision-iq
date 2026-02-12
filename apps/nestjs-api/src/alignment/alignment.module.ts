import { Module } from "@nestjs/common";
import { DeepSeekModule } from "../deepseek-integration/deepseek.module";
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
		QueueModule,
	],
	controllers: [AlignmentController],
	providers: [AlignmentService],
})
export class AlignmentModule {}
