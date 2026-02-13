import { Module } from "@nestjs/common";
import { GeminiAnalysisService } from "./gemini-analysis.service";
import { DeepSeekModule } from "../deepseek-integration/deepseek.module";

@Module({
  imports: [DeepSeekModule],
  providers: [GeminiAnalysisService],
  exports: [GeminiAnalysisService],
})
export class ImageAnalysisModule {}
