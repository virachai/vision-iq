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

    // Use Promise.allSettled instead of Promise.all to prevent
    // one keyword failure from abandoning cleanup of other keywords.
    const settledResults = await Promise.allSettled(
      description.keywords.map((kw) =>
        this.pexelsSyncService
          .syncPexelsLibrary(kw.keyword, 80, 0.1, descriptionId, kw.id)
          .then(async (res) => {
            this.logger.log(
              `Keyword "${kw.keyword}" (ID: ${kw.id}) sync completed. Marking as used.`,
            );
            await this.sceneRepo.updateKeywordUsed(kw.id, true);
            return res;
          }),
      ),
    );

    const fulfilled = settledResults.filter(
      (r): r is PromiseFulfilledResult<SyncResult> => r.status === "fulfilled",
    );
    const rejected = settledResults.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );

    if (rejected.length > 0) {
      this.logger.warn(
        `${rejected.length}/${settledResults.length} keyword syncs failed for description ${descriptionId}`,
      );
      for (const r of rejected) {
        this.logger.error(
          `  Keyword sync error: ${r.reason?.message || r.reason}`,
        );
      }
    }

    // Mark description status based on results:
    // - All succeeded → COMPLETED
    // - All failed → FAILED
    // - Partial → COMPLETED (some keywords worked, failed ones will be retried by cron)
    if (fulfilled.length > 0) {
      await this.sceneRepo.updateDescriptionStatus(descriptionId, "COMPLETED");
    } else {
      // All keywords failed
      const firstError =
        rejected[0]?.reason?.message || "All keyword syncs failed";
      await this.sceneRepo.updateDescriptionStatus(
        descriptionId,
        "FAILED",
        firstError,
      );
    }

    const syncResults = fulfilled.map((r) => r.value);

    return {
      total_images: syncResults.reduce((acc, r) => acc + r.total_images, 0),
      total_batches: syncResults.reduce((acc, r) => acc + r.total_batches, 0),
      job_ids: syncResults.flatMap((r) => r.job_ids),
      status: rejected.length === 0 ? "completed" : "partial",
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
