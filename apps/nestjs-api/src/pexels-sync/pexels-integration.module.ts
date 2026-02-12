import { Module } from "@nestjs/common";
import { PexelsIntegrationService } from "./pexels-integration.service";

@Module({
  providers: [PexelsIntegrationService],
  exports: [PexelsIntegrationService],
})
export class PexelsIntegrationModule {}
