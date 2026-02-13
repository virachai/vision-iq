// Re-export shared pipeline types so existing imports from this file continue to work
export type { Composition, MoodDna } from "../../shared/pipeline-types";

export class SceneIntentDto {
  intent: string; // Raw description of what the scene should show
  required_impact: number; // 1.0 - 10.0: subject prominence
  preferred_composition: import("../../shared/pipeline-types").Composition;
}

export class ExtractVisualIntentDto {
  raw_gemini_text: string; // Conversational text from Gemini Live
  auto_match?: boolean; // Automatically trigger image matching/syncing
}

export class FindAlignedImagesDto {
  scenes: SceneIntentDto[];
  top_k?: number; // default: 5 results per scene
  mood_consistency_weight?: number; // 0-1, default 0.05 (5%)
}

export interface ImageMatch {
  image_id: string;
  pexels_id: string;
  url: string;
  match_score: number; // 0-1
  vector_similarity: number;
  impact_relevance: number;
  composition_match: number;
  mood_consistency_score: number;
  // biome-ignore lint/suspicious/noExplicitAny: Metadata structure varies
  metadata: any; // ImageMetadata+composition+moodDna
}

export interface RankingBreakdown {
  vector_similarity_weight: number; // 0.5
  impact_relevance_weight: number; // 0.3
  composition_match_weight: number; // 0.15
  mood_consistency_weight: number; // 0.05
}
