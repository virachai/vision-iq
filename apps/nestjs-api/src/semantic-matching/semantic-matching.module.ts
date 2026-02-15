import { Module } from "@nestjs/common";
import { SemanticMatchingService } from "./semantic-matching.service";
import { ImageAnalysisModule } from "../image-analysis/image-analysis.module";

import { ClusteringService } from "./clustering.service";

@Module({
  imports: [ImageAnalysisModule],
  providers: [SemanticMatchingService, ClusteringService],
  exports: [SemanticMatchingService],
})
export class SemanticMatchingModule {}
