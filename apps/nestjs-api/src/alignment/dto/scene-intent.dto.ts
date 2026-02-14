// Re-export shared pipeline types so existing imports from this file continue to work
export type { Composition, MoodDna } from "../../shared/pipeline-types";
import { Expose, Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  Max,
  ValidateNested,
} from "class-validator";

export class SceneIntentDto {
  @Expose()
  @IsString()
  intent: string; // Raw description of what the scene should show

  @Expose({ name: "required_impact" })
  @IsNumber()
  @Min(1)
  @Max(10)
  requiredImpact: number; // 1.0 - 10.0: subject prominence

  @Expose({ name: "preferred_composition" })
  @IsObject()
  preferredComposition: import("../../shared/pipeline-types").Composition;

  // New structured layers for Visual Intent-Driven Search
  @Expose({ name: "visual_intent" })
  @IsOptional()
  @IsObject()
  visualIntent?: {
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
  @Expose({ name: "raw_gemini_text" })
  @IsString()
  rawGeminiText: string; // Conversational text from Gemini Live

  @Expose({ name: "auto_match" })
  @IsOptional()
  @IsBoolean()
  autoMatch?: boolean; // Automatically trigger image matching/syncing
}

export class FindAlignedImagesDto {
  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SceneIntentDto)
  scenes: SceneIntentDto[];

  @Expose({ name: "top_k" })
  @IsOptional()
  @IsNumber()
  topK?: number; // default: 5 results per scene

  @Expose({ name: "mood_consistency_weight" })
  @IsOptional()
  @IsNumber()
  moodConsistencyWeight?: number; // 0-1, default 0.05 (5%)
}

export interface ImageMatch {
  imageId: string;
  pexelsId: string;
  url: string;
  matchScore: number; // 0-1
  vectorSimilarity: number;
  impactRelevance: number;
  compositionMatch: number;
  moodConsistencyScore: number;
  // biome-ignore lint/suspicious/noExplicitAny: Metadata structure varies
  metadata: any; // ImageMetadata+composition+moodDna
}

export interface RankingBreakdown {
  vectorSimilarityWeight: number; // 0.5
  impactRelevanceWeight: number; // 0.3
  compositionMatchWeight: number; // 0.15
  moodConsistencyWeight: number; // 0.05
}
