import { Module } from "@nestjs/common";
import { SemanticMatchingService } from "./semantic-matching.service";
import { ImageAnalysisModule } from "../image-analysis/image-analysis.module";

@Module({
  imports: [ImageAnalysisModule],
  providers: [SemanticMatchingService],
  exports: [SemanticMatchingService],
})
export class SemanticMatchingModule {}
