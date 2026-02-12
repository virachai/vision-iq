import { Module } from "@nestjs/common";
import { SemanticMatchingService } from "./semantic-matching.service";

@Module({
  providers: [SemanticMatchingService],
  exports: [SemanticMatchingService],
})
export class SemanticMatchingModule {}
