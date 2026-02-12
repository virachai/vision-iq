import { Injectable, Logger } from "@nestjs/common";
import { PrismaClient } from "@repo/database";
import {
	SceneIntentDto,
	ImageMatch,
	RankingBreakdown,
} from "../alignment/dto/scene-intent.dto";

interface VectorSearchResult {
	id: string;
	pexelsId: string;
	url: string;
	photographer: string | null;
	metadata: {
		impactScore: number;
		visualWeight: number;
		composition: any;
		moodDna: any;
		metaphoricalTags: string[];
	};
	similarity: number;
}

@Injectable()
export class SemanticMatchingService {
	private readonly logger = new Logger(SemanticMatchingService.name);
	private readonly rankingWeights: RankingBreakdown = {
		vector_similarity_weight: 0.5,
		impact_relevance_weight: 0.3,
		composition_match_weight: 0.15,
		mood_consistency_weight: 0.05,
	};

	constructor(private readonly prisma: PrismaClient) {}

	/**
	 * Find semantically aligned images for a sequence of scenes
	 * Implements visual anchor logic: first image's mood_dna locks subsequent matches
	 */
	async findAlignedImages(
		scenes: SceneIntentDto[],
		topK: number = 5,
		moodConsistencyMultiplier: number = 1.0,
	): Promise<ImageMatch[][]> {
		const results: ImageMatch[][] = [];
		let visualAnchorMood: any = null;

		for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex++) {
			const scene = scenes[sceneIndex];
			const isFirstScene = sceneIndex === 0;

			try {
				// Generate embedding for scene intent (simplified: use metadata text)
				// In production, this would call OpenAI/Cohere embedding API
				const sceneEmbedding = await this.generateEmbeddingForScene(scene);

				// Perform vector + metadata search
				const matches = await this.searchImages(
					sceneEmbedding,
					scene,
					topK,
					isFirstScene ? null : visualAnchorMood,
					moodConsistencyMultiplier,
				);

				// Rank and score images
				const rankedMatches = this.rankMatches(
					matches,
					scene,
					isFirstScene,
					visualAnchorMood,
					moodConsistencyMultiplier,
				);

				results.push(rankedMatches);

				// Capture mood anchor from first image of first scene
				if (isFirstScene && rankedMatches.length > 0) {
					visualAnchorMood = rankedMatches[0].metadata?.moodDna || null;
					this.logger.debug(
						`Set visual anchor mood: ${JSON.stringify(visualAnchorMood)}`,
					);
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
		visualAnchorMood: any,
		moodConsistencyMultiplier: number,
	): Promise<VectorSearchResult[]> {
		try {
			// Build raw SQL for vector similarity search with pgvector
			// Cosine similarity: 1 - (vector <=> embedding)
			const query = `
        SELECT 
          pi.id,
          pi."pexelsId",
          pi.url,
          pi.photographer,
          1 - (ie.embedding <=> $1::vector) as similarity,
          json_build_object(
            'impactScore', im."impactScore",
            'visualWeight', im."visualWeight",
            'composition', im.composition,
            'moodDna', im."moodDna",
            'metaphoricalTags', im."metaphoricalTags"
          ) as metadata
        FROM public."ImageEmbedding" ie
        JOIN public."PexelsImage" pi ON ie."imageId" = pi.id
        JOIN public."ImageMetadata" im ON im."imageId" = pi.id
        WHERE 
          im."impactScore" >= $2 
          AND (1 - (ie.embedding <=> $1::vector)) > 0.3
        ORDER BY similarity DESC
        LIMIT $3
      `;

			// Minimum impact score based on scene requirement (allow ±2)
			const minImpactScore = Math.max(1, scene.required_impact - 2);

			// Execute raw query
			const results = await this.prisma.$queryRawUnsafe<VectorSearchResult[]>(
				query,
				JSON.stringify(embedding),
				minImpactScore,
				topK * 2, // Get more candidates to filter by mood if needed
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
		visualAnchorMood: any,
		moodConsistencyMultiplier: number,
	): ImageMatch[] {
		const matches: ImageMatch[] = candidates
			.map((candidate) => {
				// Vector similarity (already 0-1)
				const vectorSimilarity = candidate.similarity || 0;

				// Impact relevance: 1 - |required_impact - image_impact| / 10
				const impactDifference = Math.abs(
					scene.required_impact - candidate.metadata.impactScore,
				);
				const impactRelevance = Math.max(0, 1 - impactDifference / 10);

				// Composition match: check shot_type and angle
				const compositionMatch = this.getCompositionMatch(
					scene.preferred_composition,
					candidate.metadata.composition,
				);

				// Mood consistency score
				const moodConsistencyScore = isFirstScene
					? 1.0 // First scene always gets full mood score
					: this.getMoodConsistencyScore(
							visualAnchorMood,
							candidate.metadata.moodDna,
						);

				// Final score calculation
				const finalScore =
					this.rankingWeights.vector_similarity_weight * vectorSimilarity +
					this.rankingWeights.impact_relevance_weight * impactRelevance +
					this.rankingWeights.composition_match_weight * compositionMatch +
					this.rankingWeights.mood_consistency_weight *
						moodConsistencyScore *
						moodConsistencyMultiplier;

				return {
					image_id: candidate.id,
					pexels_id: candidate.pexelsId,
					url: candidate.url,
					match_score: Math.min(1, finalScore), // Clamp to 0-1
					vector_similarity: vectorSimilarity,
					impact_relevance: impactRelevance,
					composition_match: compositionMatch,
					mood_consistency_score: moodConsistencyScore,
					metadata: candidate.metadata,
				};
			})
			.sort((a, b) => b.match_score - a.match_score)
			.slice(0, 5); // Return top 5 after ranking

		return matches;
	}

	/**
	 * Compare composition preferences
	 * Awards 1.0 for exact match, 0.5 for partial match, 0 for no match
	 */
	private getCompositionMatch(preferred: any, imageComp: any): number {
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
	private getMoodConsistencyScore(anchorMood: any, candidateMood: any): number {
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
					r: parseInt(result[1], 16),
					g: parseInt(result[2], 16),
					b: parseInt(result[3], 16),
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
		// Placeholder: return random 1536-dim vector
		// In production, call OpenAI text-embedding-3-small or similar
		// This is a temporary implementation for schema validation
		const embedding = new Array(1536).fill(0).map(() => Math.random());
		return embedding;
	}
}
