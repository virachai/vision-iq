import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { AlignmentService } from "../src/alignment/alignment.service";
import { Logger } from "@nestjs/common";

async function bootstrap() {
  const logger = new Logger("TriggerPexelsSync");
  logger.log("Starting Pexels Sync Trigger Script...");

  const app = await NestFactory.createApplicationContext(AppModule);
  const alignmentService = app.get(AlignmentService);

  const searchQuery = process.argv[2] || "nature";
  const batchSize = parseInt(process.argv[3], 10) || 50;

  logger.log(
    `Triggering sync for query: "${searchQuery}" with batch size: ${batchSize}`,
  );

  try {
    const result = await alignmentService.syncPexelsLibrary(
      searchQuery,
      batchSize,
    );
    logger.log("Sync queued successfully:");
    logger.log(JSON.stringify(result, null, 2));

    // Optional: Trigger keyword sync if no query provided or as a bonus
    if (!process.argv[2]) {
      logger.log("Checking for un-used keywords to sync...");
      const keywordResult = await alignmentService.autoSyncUnusedKeywords();
      logger.log(
        `Processed ${keywordResult.processed} descriptions with unused keywords.`,
      );
    }

    logger.log("Sync process initiated. Analysis jobs are being queued.");
  } catch (error: any) {
    logger.error("Failed to trigger Pexels sync:", error.message);
  } finally {
    await app.close();
    process.exit(0);
  }
}

bootstrap();
