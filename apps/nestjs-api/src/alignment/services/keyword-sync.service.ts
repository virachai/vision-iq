import { Injectable, Logger } from "@nestjs/common";
import { PexelsSyncService } from "../../pexels-sync/pexels-sync.service";
import { SceneRepository } from "../repositories/scene.repository";
import { SyncResult } from "../../shared/pipeline-types";

@Injectable()
export class KeywordSyncService {
  private readonly logger = new Logger(KeywordSyncService.name);

  constructor(
    private readonly pexelsSyncService: PexelsSyncService,
    private readonly sceneRepo: SceneRepository,
  ) {}

  async syncPexelsLibrary(
    searchQuery = "nature",
    batchSize = 50,
    failureThreshold = 0.1,
  ): Promise<SyncResult> {
    return this.pexelsSyncService.syncPexelsLibrary(
      searchQuery,
      batchSize,
      failureThreshold,
    );
  }

  async syncPexelsByDescriptionId(descriptionId: string): Promise<SyncResult> {
    this.logger.log(
      `Manual keyword-sync request for description ${descriptionId}`,
    );

    const description = await this.sceneRepo.findDescriptionById(descriptionId);

    if (!description) {
      throw new Error(`VisualDescription not found: ${descriptionId}`);
    }

    if (description.keywords.length === 0) {
      this.logger.warn(`No unused keywords for description ${descriptionId}`);
      return {
        total_images: 0,
        total_batches: 0,
        job_ids: [],
        status: "completed",
      };
    }

    this.logger.log(
      `Triggering manual sync for ${description.keywords.length} keywords of description ${descriptionId}`,
    );

    const syncResults = await Promise.all(
      description.keywords.map((kw) =>
        this.pexelsSyncService
          .syncPexelsLibrary(kw.keyword, 1000, 0.1, descriptionId, kw.id)
          .then(async (res) => {
            await this.sceneRepo.updateKeywordUsed(kw.id, true);
            return res;
          }),
      ),
    );

    return {
      total_images: syncResults.reduce((acc, r) => acc + r.total_images, 0),
      total_batches: syncResults.reduce((acc, r) => acc + r.total_batches, 0),
      job_ids: syncResults.flatMap((r) => r.job_ids),
      status: "completed",
    };
  }

  async autoSyncUnusedKeywords(): Promise<{
    processed: number;
    results: any[];
  }> {
    this.logger.log("Checking for unused keywords to trigger auto-sync");

    const descriptions =
      await this.sceneRepo.findDescriptionWithUnusedKeywords();

    if (descriptions.length === 0) {
      this.logger.debug("No descriptions with unused keywords found");
      return { processed: 0, results: [] };
    }

    this.logger.log(
      `Found ${descriptions.length} descriptions with unused keywords. Triggering sync...`,
    );

    const results = [];
    for (const desc of descriptions) {
      try {
        const result = await this.syncPexelsByDescriptionId(desc.id);
        results.push({ descriptionId: desc.id, status: "success", result });
      } catch (error: any) {
        this.logger.error(
          `Auto-sync failed for description ${desc.id}: ${error.message}`,
        );
        results.push({
          descriptionId: desc.id,
          status: "failed",
          error: error.message,
        });
      }
    }

    return {
      processed: descriptions.length,
      results,
    };
  }
}
