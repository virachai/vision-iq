import { Module, forwardRef } from "@nestjs/common";
import { PexelsIntegrationService } from "./pexels-integration.service";
import { PexelsSyncService } from "./pexels-sync.service";
import { QueueModule } from "../queue/queue.module";

@Module({
  imports: [forwardRef(() => QueueModule)],
  providers: [PexelsIntegrationService, PexelsSyncService],
  exports: [PexelsIntegrationService, PexelsSyncService],
})
export class PexelsIntegrationModule {}
