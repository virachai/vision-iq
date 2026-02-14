// Re-export shared pipeline types so existing imports from this file continue to work
export type { Composition, MoodDna } from "../../shared/pipeline-types";

export class SceneIntentDto {
  intent: string; // Raw description of what the scene should show
  required_impact: number; // 1.0 - 10.0: subject prominence
  preferred_composition: import("../../shared/pipeline-types").Composition;

  // New structured layers for Visual Intent-Driven Search
  visual_intent?: {
    emotional_layer?: {
      intent_words: string[]; // e.g., ["overwhelmed", "suffocation"]
      vibe: string;
    };
    spatial_strategy?: {
      strategy_words: string[]; // e.g., ["negative space center", "wide shot"]
      shot_type: string;
      balance: string;
    };
    subject_treatment?: {
      treatment_words: string[]; // e.g., ["hidden face", "vulnerable posture"]
      identity: string;
      dominance: string;
    };
    color_mapping?: {
      temperature_words: string[]; // e.g., ["harsh light", "warm tone"]
      temperature: "warm" | "cold";
      contrast: "low" | "medium" | "high";
    };
  };
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
