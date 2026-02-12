import { Module } from "@nestjs/common";
import { GeminiAnalysisService } from "./gemini-analysis.service";

@Module({
	providers: [GeminiAnalysisService],
	exports: [GeminiAnalysisService],
})
export class ImageAnalysisModule {}
