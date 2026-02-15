import { Injectable, Logger } from "@nestjs/common";
import { ImageMatch, MoodDna } from "../alignment/dto/scene-intent.dto";

@Injectable()
export class ClusteringService {
  private readonly logger = new Logger(ClusteringService.name);

  /**
   * Groups candidates into clusters based on MoodDNA similarity.
   * Simple heuristic: Group by temperature proximity (within +/- 1000K).
   */
  groupCandidatesByMood(candidates: ImageMatch[]): ImageMatch[][] {
    if (!candidates.length) return [];

    // Sort by match score first to have best centers
    const sorted = [...candidates].sort((a, b) => b.matchScore - a.matchScore);
    const clusters: ImageMatch[][] = [];
    const assignedIds = new Set<string>();

    for (const candidate of sorted) {
      if (assignedIds.has(candidate.imageId)) continue;

      // Start new cluster
      const currentCluster = [candidate];
      assignedIds.add(candidate.imageId);

      const centerTemp = candidate.metadata?.moodDna?.temp ?? 5500; // Default to daylight neutral

      // Find neighbors
      for (const other of sorted) {
        if (assignedIds.has(other.imageId)) continue;

        const otherTemp = other.metadata?.moodDna?.temp ?? 5500;

        // Threshold: 1000K difference max for "coherence"
        if (Math.abs(centerTemp - otherTemp) <= 1000) {
          currentCluster.push(other);
          assignedIds.add(other.imageId);
        }
      }

      clusters.push(currentCluster);
    }

    this.logger.debug(
      `Grouped ${candidates.length} candidates into ${clusters.length} clusters.`,
    );
    return clusters;
  }

  /**
   * Selects the best cluster based on context (previous image mood).
   * If no context, returns the cluster with the highest cumulative score.
   */
  selectBestCluster(
    clusters: ImageMatch[][],
    previousMood?: MoodDna | null,
  ): ImageMatch[] {
    if (!clusters.length) return [];

    let bestCluster = clusters[0];
    let maxScore = -1;

    for (const cluster of clusters) {
      let clusterScore = 0;

      // Base score: Average semantic match score of images in cluster
      const avgSemanticScore =
        cluster.reduce((sum, img) => sum + img.matchScore, 0) / cluster.length;
      clusterScore += avgSemanticScore;

      // Context Bonus: If previous mood exists, boost clusters that are close in temp
      if (previousMood) {
        const clusterTemp = this.getClusterAverageTemp(cluster);
        const targetTemp = (previousMood.temp as unknown as number) ?? 5500;
        const diff = Math.abs(clusterTemp - targetTemp);

        // Normalize diff (assuming max useful diff is ~4000K)
        // Bonus up to +0.3 for perfect match
        const consistencyBonus = Math.max(0, 0.3 * (1 - diff / 4000));
        clusterScore += consistencyBonus;
      }

      if (clusterScore > maxScore) {
        maxScore = clusterScore;
        bestCluster = cluster;
      }
    }

    return bestCluster;
  }

  private getClusterAverageTemp(cluster: ImageMatch[]): number {
    if (!cluster.length) return 5500;
    const sum = cluster.reduce(
      (acc, img) => acc + (img.metadata?.moodDna?.temp ?? 5500),
      0,
    );
    return sum / cluster.length;
  }
}
