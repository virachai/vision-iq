import { Injectable, Logger, Inject } from "@nestjs/common";
import { PrismaClient } from "@repo/database";
import { PRISMA_SERVICE } from "../prisma/prisma.module";

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(@Inject(PRISMA_SERVICE) private readonly prisma: PrismaClient) {}

  /**
   * Rollback a VisualIntentRequest and all its downstream entities
   * Traverses from the bottom (matches) up to the request itself
   */
  async rollbackRequest(requestId: string) {
    this.logger.log(`Starting bottom-up rollback for Request: ${requestId}`);

    try {
      // 1. Find all Scenes associated with this Request
      const scenes = await this.prisma.sceneIntent.findMany({
        where: { requestId },
        select: { id: true },
      });

      const sceneIds = scenes.map((s) => s.id);

      if (sceneIds.length > 0) {
        // 2. Find all VisualDescriptions for these Scenes
        const descriptions = await this.prisma.visualDescription.findMany({
          where: { sceneIntentId: { in: sceneIds } },
          select: { id: true },
        });

        const descriptionIds = descriptions.map((d) => d.id);

        if (descriptionIds.length > 0) {
          // 3. Delete PexelsImageDescription (Matches)
          // Cascading is handled by Prisma, but we can do it explicitly for clarity or if dependencies are complex
          // Here, VisualDescription -> PexelsImageDescription is onDelete: Cascade

          // 4. Delete PexelsSyncHistory (Safe cleanup)
          await this.prisma.pexelsSyncHistory.deleteMany({
            where: { descriptionId: { in: descriptionIds } },
          });

          this.logger.debug(
            `Cleaned up sync history for ${descriptionIds.length} descriptions`,
          );
        }

        // 5. Delete SceneIntents (This will cascade delete VisualDescriptions, Keywords, etc.)
        await this.prisma.sceneIntent.deleteMany({
          where: { id: { in: sceneIds } },
        });

        this.logger.debug(
          `Deleted ${sceneIds.length} scenes (cascaded cleanup)`,
        );
      }

      // 6. Finally, delete the Request itself
      await this.prisma.visualIntentRequest.delete({
        where: { id: requestId },
      });

      this.logger.log(`Successfully rolled back Request: ${requestId}`);
      return { success: true, requestId };
    } catch (error: any) {
      this.logger.error(
        `Rollback failed for Request ${requestId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Safe cleanup of stalled sync history
   */
  async cleanupStalledSyncs(minutesThreshold = 60) {
    const thresholdDate = new Date();
    thresholdDate.setMinutes(thresholdDate.getMinutes() - minutesThreshold);

    const result = await this.prisma.pexelsSyncHistory.deleteMany({
      where: {
        status: "pending",
        createdAt: { lt: thresholdDate },
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `Cleaned up ${result.count} stalled sync history records older than ${minutesThreshold}m`,
      );
    }
    return result;
  }
}
