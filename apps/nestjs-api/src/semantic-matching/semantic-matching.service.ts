import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Pool } from "pg";
import { PG_POOL } from "../prisma/prisma.module";
import type { Composition, MoodDna } from "../shared/pipeline-types";
import type {
  ImageMatch,
  RankingBreakdown,
  SceneIntentDto,
} from "../alignment/dto/scene-intent.dto";
import { GeminiAnalysisService } from "../image-analysis/gemini-analysis.service";
import { ClusteringService } from "./clustering.service";

interface VectorSearchResult {
  id: string;
  pexelsId: string;
  url: string;
  photographer: string | null;
  metadata: {
    impactScore: number;
    visualWeight: number;
    composition: Composition;
    moodDna: MoodDna;
    metaphoricalTags: string[];
  };
  similarity: number;
}

@Injectable()
export class SemanticMatchingService {
  private readonly logger = new Logger(SemanticMatchingService.name);
  private readonly rankingWeights: RankingBreakdown = {
    vectorSimilarityWeight: 0.5,
    impactRelevanceWeight: 0.3,
    compositionMatchWeight: 0.15,
    moodConsistencyWeight: 0.05,
  };

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly geminiAnalysisService: GeminiAnalysisService,
    private readonly clusteringService: ClusteringService,
  ) {
    console.log(
      "SemanticMatchingService initialized. Injected pg pool:",
      !!this.pool,
    );
  }

  /**
   * Find semantically aligned images for a sequence of scenes
   * Implements visual anchor logic: first image's mood_dna locks subsequent matches
   */
  async findAlignedImages(
    scenes: SceneIntentDto[],
    topK = 5,
    moodConsistencyMultiplier = 1.0,
  ): Promise<ImageMatch[][]> {
    const results: ImageMatch[][] = [];
    let visualAnchorMood: MoodDna | null = null;
    let previousSceneMood: MoodDna | null = null;

    for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex++) {
      const scene = scenes[sceneIndex];
      const isFirstScene = sceneIndex === 0;

      try {
        // Generate embedding for scene intent (simplified: use metadata text)
        // In production, this would call OpenAI/Cohere embedding API
        const sceneEmbedding = await this.generateEmbeddingForScene(scene);

        // Perform vector + metadata search
        // Fetch MORE candidates than topK to allow for clustering/filtering
        const candidatePoolSize = 50;
        const matches = await this.searchImages(
          sceneEmbedding,
          scene,
          candidatePoolSize,
          isFirstScene ? null : visualAnchorMood,
          moodConsistencyMultiplier,
        );

        // 1. Rank matches initially
        const rankedMatches = this.rankMatches(
          matches,
          scene,
          isFirstScene,
          visualAnchorMood,
          moodConsistencyMultiplier,
        );

        // 2. Apply Clustering Strategy
        // Group top candidates by mood
        const clusters =
          this.clusteringService.groupCandidatesByMood(rankedMatches);

        // Select best cluster based on narrative context (previous mood)
        // If it's the first scene, we might just pick the strongest individual match's cluster
        const contextMood = isFirstScene ? null : previousSceneMood;
        const bestCluster = this.clusteringService.selectBestCluster(
          clusters,
          contextMood,
        );

        // 3. Final Selection
        // Take top K from the selected cluster
        // (Or fallback to original ranked list if cluster is too small?
        // For now, let's just take top K from the cluster, resorting by score)
        const finalSelection = bestCluster
          .sort((a, b) => b.matchScore - a.matchScore)
          .slice(0, topK);

        results.push(finalSelection);

        // Capture mood anchor from first image of first scene
        if (isFirstScene && finalSelection.length > 0) {
          visualAnchorMood = finalSelection[0].metadata?.moodDna || null;
          this.logger.debug(
            `Set visual anchor mood: ${JSON.stringify(visualAnchorMood)}`,
          );
        }

        // Update previous mood for next iteration continuity
        if (finalSelection.length > 0) {
          previousSceneMood = finalSelection[0].metadata?.moodDna || null;
        }
      } catch (error) {
        this.logger.error(
          `Failed to find images for scene ${sceneIndex}`,
          (error as Error).message,
        );
        results.push([]); // Return empty results for failed scene
      }
    }

    return results;
  }

  /**
   * Search images by vector similarity and metadata filters
   */
  private async searchImages(
    embedding: number[],
    scene: SceneIntentDto,
    topK: number,
    _visualAnchorMood: MoodDna | null,
    _moodConsistencyMultiplier: number,
  ): Promise<VectorSearchResult[]> {
    try {
      // Build raw SQL for vector similarity search with pgvector
      // Cosine similarity: 1 - (vector <=> embedding)
      const query = `
        SELECT 
          pi.id,
          pi."pexelsImageId",
          pi.url,
          pi.photographer,
          1 - (ie.embedding::vector <=> $1::vector) as similarity,
          json_build_object(
            'impactScore', (da."analysisResult"->>'impactScore')::numeric,
            'visualWeight', (da."analysisResult"->>'visualWeight')::numeric,
            'composition', da."analysisResult"->'composition',
            'moodDna', da."analysisResult"->'moodDna',
            'metaphoricalTags', da."analysisResult"->'metaphoricalTags'
          ) as metadata
        FROM public."vision_iq_image_embeddings" ie
        JOIN public."vision_iq_pexels_images" pi ON ie."imageId" = pi.id
        JOIN public."vision_iq_image_analysis_jobs" job ON job."pexelsImageId" = pi.id
        JOIN public."vision_iq_deepseek_analysis" da ON da."analysisJobId" = job.id
        WHERE 
          (da."analysisResult"->>'impactScore')::numeric >= $2 
          AND (1 - (ie.embedding::vector <=> $1::vector)) > 0.3
        ORDER BY similarity DESC
        LIMIT $3
      `;

      // Minimum impact score based on scene requirement (allow ±2)
      const minImpactScore = Math.max(1, scene.requiredImpact - 2);

      // Execute raw query
      const { rows: results } = await this.pool.query<VectorSearchResult>(
        query,
        [
          JSON.stringify(embedding),
          minImpactScore,
          topK * 2, // Get more candidates to filter by mood if needed
        ],
      );

      this.logger.debug(
        `Found ${results.length} candidate images for semantic match`,
      );
      return results;
    } catch (error) {
      this.logger.error("Vector search failed", (error as Error).message);
      return [];
    }
  }

  /**
   * Rank matches using the ranking formula with weighted scores
   * Formula: (0.5 × vector_sim) + (0.3 × impact_rel) + (0.15 × comp_match) + (0.05 × mood_cons)
   */
  private rankMatches(
    candidates: VectorSearchResult[],
    scene: SceneIntentDto,
    isFirstScene: boolean,
    visualAnchorMood: MoodDna | null,
    moodConsistencyMultiplier: number,
  ): ImageMatch[] {
    const matches: ImageMatch[] = candidates
      .map((candidate) => {
        // Vector similarity (already 0-1)
        const vectorSimilarity = candidate.similarity || 0;

        // Impact relevance: 1 - |required_impact - image_impact| / 10
        const impactDifference = Math.abs(
          scene.requiredImpact - candidate.metadata.impactScore,
        );
        const impactRelevance = Math.max(0, 1 - impactDifference / 10);

        // Composition match: check shot_type and angle
        const compositionMatch = this.getCompositionMatch(
          scene.preferredComposition,
          candidate.metadata.composition,
        );

        // Mood consistency score
        const moodConsistencyScore = isFirstScene
          ? 1.0 // First scene always gets full mood score
          : this.getMoodConsistencyScore(
              visualAnchorMood,
              candidate.metadata.moodDna,
            );

        // --- NEW: Visual Intent Depth Matching ---
        let intentDepthScore = 1.0;
        if (scene.visualIntent) {
          intentDepthScore = this.calculateVisualIntentDepthScore(
            scene.visualIntent,
            candidate.metadata,
          );
        }

        // Final score calculation
        const finalScore =
          this.rankingWeights.vectorSimilarityWeight * vectorSimilarity +
          this.rankingWeights.impactRelevanceWeight * impactRelevance +
          this.rankingWeights.compositionMatchWeight * compositionMatch +
          this.rankingWeights.moodConsistencyWeight *
            moodConsistencyScore *
            moodConsistencyMultiplier;

        const weightedFinalScore = finalScore * (0.8 + intentDepthScore * 0.2);

        return {
          imageId: candidate.id,
          pexelsId: candidate.pexelsId,
          url: candidate.url,
          matchScore: Math.min(1, weightedFinalScore), // Clamp to 0-1
          vectorSimilarity: vectorSimilarity,
          impactRelevance: impactRelevance,
          compositionMatch: compositionMatch,
          moodConsistencyScore: moodConsistencyScore,
          metadata: candidate.metadata,
        };
      })
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5); // Return top 5 after ranking

    return matches;
  }

  /**
   * Compare composition preferences
   * Awards 1.0 for exact match, 0.5 for partial match, 0 for no match
   */
  private getCompositionMatch(
    preferred: Composition,
    imageComp: Composition,
  ): number {
    let score = 0;

    // Check shot type match
    if (preferred.shot_type === imageComp.shot_type) {
      score += 0.5;
    } else {
      // Partial credit for adjacent shot types
      const shotDistance = Math.abs(
        ["CU", "MS", "WS"].indexOf(preferred.shot_type) -
          ["CU", "MS", "WS"].indexOf(imageComp.shot_type),
      );
      if (shotDistance === 1) {
        score += 0.25;
      }
    }

    // Check angle match
    if (preferred.angle === imageComp.angle) {
      score += 0.5;
    } else {
      score += 0.1; // Minimal bonus for any angle
    }

    return Math.min(1, score);
  }

  /**
   * Calculate mood consistency score with soft penalty
   * Compares color temperature and primary color of anchor vs candidate
   */
  private getMoodConsistencyScore(
    anchorMood: MoodDna | null,
    candidateMood: MoodDna | null,
  ): number {
    if (!anchorMood || !candidateMood) {
      return 0.5; // Default neutral score if mood missing
    }

    let score = 1.0;

    // Temperature match (warm/cold)
    if (anchorMood.temp !== candidateMood.temp) {
      score -= 0.2; // 20% penalty for temperature mismatch (soft constraint)
    }

    // Color proximity (simplified hex distance)
    if (anchorMood.primary_color && candidateMood.primary_color) {
      const colorDistance = this.getHexColorDistance(
        anchorMood.primary_color,
        candidateMood.primary_color,
      );
      // Normalize distance to 0-1 scale
      const normalizedDistance = Math.min(1, colorDistance / 300);
      score -= normalizedDistance * 0.1; // Up to 10% penalty for color difference
    }

    return Math.max(0, score);
  }

  /**
   * Calculate Euclidean distance in RGB space between two hex colors
   */
  private getHexColorDistance(hex1: string, hex2: string): number {
    const rgb1 = this.hexToRgb(hex1);
    const rgb2 = this.hexToRgb(hex2);

    if (!rgb1 || !rgb2) return 300; // Max distance if colors invalid

    const rDiff = rgb1.r - rgb2.r;
    const gDiff = rgb1.g - rgb2.g;
    const bDiff = rgb1.b - rgb2.b;

    return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
  }

  /**
   * Convert hex color to RGB
   */
  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: Number.parseInt(result[1], 16),
          g: Number.parseInt(result[2], 16),
          b: Number.parseInt(result[3], 16),
        }
      : null;
  }

  /**
   * Generate embedding for scene intent text
   * TODO: integrate with OpenAI embeddings or local model
   */
  private async generateEmbeddingForScene(
    scene: SceneIntentDto,
  ): Promise<number[]> {
    // Strategy: Construct a rich descriptive string from the scene intent
    let textToEmbed = scene.intent;

    if (scene.visualIntent) {
      const vi = scene.visualIntent;
      if (vi.emotional_layer?.intent_words) {
        textToEmbed += ` ${vi.emotional_layer.intent_words.join(" ")}`;
      }
      if (vi.spatial_strategy?.strategy_words) {
        textToEmbed += ` ${vi.spatial_strategy.strategy_words.join(" ")}`;
      }
    }
    // Using Gemini text-embedding-004
    return this.geminiAnalysisService.generateEmbedding(textToEmbed);
  }

  /**
   * Calculate how well an image metadata matches the 4-layer visual intent
   */
  private calculateVisualIntentDepthScore(
    intent: NonNullable<SceneIntentDto["visualIntent"]>,
    metadata: any,
  ): number {
    let score = 0;
    let counts = 0;

    // 1. Emotional Layer (metaphorical tags match)
    if (intent.emotional_layer?.intent_words && metadata.metaphoricalTags) {
      const matches = intent.emotional_layer.intent_words.filter((w) =>
        metadata.metaphoricalTags.some((t: string) =>
          t.toLowerCase().includes(w.toLowerCase()),
        ),
      );
      if (intent.emotional_layer.intent_words.length > 0) {
        score += matches.length / intent.emotional_layer.intent_words.length;
        counts++;
      }
    }

    // 2. Color Mapping
    if (intent.color_mapping && metadata.moodDna) {
      if (intent.color_mapping.temperature === metadata.moodDna.temp) {
        score += 1.0;
      }
      counts++;
    }

    // 3. Subject Treatment (identity/dominance)
    // This often relies on cinematic_notes or specific fields if joined with VisualIntentAnalysis
    // For now, we use a simple heuristic if the words appear in metadata strings
    if (intent.subject_treatment?.treatment_words) {
      const treatmentStr = JSON.stringify(metadata).toLowerCase();
      const matches = intent.subject_treatment.treatment_words.filter((w) =>
        treatmentStr.includes(w.toLowerCase()),
      );
      if (intent.subject_treatment.treatment_words.length > 0) {
        score +=
          matches.length / intent.subject_treatment.treatment_words.length;
        counts++;
      }
    }

    return counts > 0 ? score / counts : 1.0;
  }
}
