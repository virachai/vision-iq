/**
 * Pipeline Types — Single Source of Truth
 *
 * All pipeline stages import their shared types from this module.
 * This ensures consistency, alignment, and input/output standards
 * across every step in the AI pipeline flow.
 */

// ═══════════════════════════════════════════════════════════════════
// Composition — Unified 5-field version
// ═══════════════════════════════════════════════════════════════════

export interface Composition {
  negative_space: "left" | "right" | "center";
  shot_type: "CU" | "MS" | "WS"; // Close-Up, Medium Shot, Wide Shot
  angle: "low" | "eye" | "high";
  balance: "symmetrical" | "asymmetrical";
  subject_dominance: "weak" | "moderate" | "strong";
}

// ═══════════════════════════════════════════════════════════════════
// MoodDna — Unified 5-field superset
// ═══════════════════════════════════════════════════════════════════

export interface MoodDna {
  temp: number | "warm" | "cold";
  primary_color: string; // hex color e.g. "#E8D4C0"
  vibe: string; // e.g., "minimalist", "cinematic", "chaotic"
  emotional_intensity: string; // e.g., "low", "medium", "strong"
  rhythm: string; // e.g., "calm", "dynamic", "tense"
}

// ═══════════════════════════════════════════════════════════════════
// ColorProfile
// ═══════════════════════════════════════════════════════════════════

export interface ColorProfile {
  temperature: "warm" | "cold";
  primary_color: string;
  secondary_colors: string[];
  contrast_level: "low" | "medium" | "high";
}

// ═══════════════════════════════════════════════════════════════════
// GeminiAnalysisResult — Canonical analysis output
// ═══════════════════════════════════════════════════════════════════

export interface GeminiAnalysisResult {
  impact_score: number;
  visual_weight: number;
  composition: Composition;
  color_profile: ColorProfile;
  mood_dna: MoodDna;
  metaphorical_tags: string[];
  cinematic_notes: string;
}

// ═══════════════════════════════════════════════════════════════════
// SyncResult — Deduplicated sync status
// ═══════════════════════════════════════════════════════════════════

export interface SyncResult {
  total_images: number;
  total_batches: number;
  job_ids: string[];
  status: "queued" | "in_progress" | "completed" | "failed";
  errors?: string[];
}

// ═══════════════════════════════════════════════════════════════════
// Grade Level — Analysis quality validation
// ═══════════════════════════════════════════════════════════════════

export type GradeLevel = "none" | "easy" | "medium" | "hard";

// ═══════════════════════════════════════════════════════════════════
// Batch Analysis Types
// ═══════════════════════════════════════════════════════════════════

export interface BatchAnalysisItem {
  imageUrl: string;
  id: string;
}

export interface BatchAnalysisResult {
  id: string;
  result?: GeminiAnalysisResult;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════
// Normalization — Single shared implementation
// ═══════════════════════════════════════════════════════════════════

const VALID_NEGATIVE_SPACES = ["left", "right", "center"] as const;
const VALID_SHOT_TYPES = ["CU", "MS", "WS"] as const;
const VALID_ANGLES = ["low", "eye", "high"] as const;
const VALID_BALANCES = ["symmetrical", "asymmetrical"] as const;
const VALID_DOMINANCES = ["weak", "moderate", "strong"] as const;
const VALID_TEMPS = ["warm", "cold"] as const;
const VALID_CONTRASTS = ["low", "medium", "high"] as const;

/**
 * Normalize and validate any parsed object to a well-formed GeminiAnalysisResult.
 * Safe to call with partial, missing, or malformed data — all fields get defaults.
 */
// biome-ignore lint/suspicious/noExplicitAny: Normalizing untyped AI response data
export function normalizeGeminiResult(parsed: any): GeminiAnalysisResult {
  const temperature = VALID_TEMPS.includes(parsed?.color_profile?.temperature)
    ? parsed.color_profile.temperature
    : "warm";

  return {
    impact_score: Math.min(10, Math.max(1, parsed?.impact_score || 5)),
    visual_weight: Math.min(10, Math.max(1, parsed?.visual_weight || 5)),
    composition: normalizeComposition(parsed?.composition),
    color_profile: {
      temperature,
      primary_color: parsed?.color_profile?.primary_color || "neutral",
      secondary_colors: Array.isArray(parsed?.color_profile?.secondary_colors)
        ? parsed.color_profile.secondary_colors
        : [],
      contrast_level: VALID_CONTRASTS.includes(
        parsed?.color_profile?.contrast_level,
      )
        ? parsed.color_profile.contrast_level
        : "medium",
    },
    mood_dna: normalizeMoodDna(
      parsed?.mood_dna,
      temperature,
      parsed?.color_profile?.primary_color,
    ),
    metaphorical_tags: Array.isArray(parsed?.metaphorical_tags)
      ? parsed.metaphorical_tags.slice(0, 15)
      : Array.isArray(parsed?.metaphorical_field)
      ? parsed.metaphorical_field.slice(0, 15)
      : [],
    cinematic_notes: parsed?.cinematic_notes || "",
  };
}

/**
 * Normalize any partial composition to a valid 5-field Composition.
 * Accepts both 3-field (DTO) and 5-field (Gemini) inputs.
 */
// biome-ignore lint/suspicious/noExplicitAny: Normalizing untyped composition data
export function normalizeComposition(comp: any): Composition {
  return {
    negative_space: VALID_NEGATIVE_SPACES.includes(comp?.negative_space)
      ? comp.negative_space
      : "center",
    shot_type: VALID_SHOT_TYPES.includes(comp?.shot_type)
      ? comp.shot_type
      : "MS",
    angle: VALID_ANGLES.includes(comp?.angle) ? comp.angle : "eye",
    balance: VALID_BALANCES.includes(comp?.balance)
      ? comp.balance
      : "asymmetrical",
    subject_dominance: VALID_DOMINANCES.includes(comp?.subject_dominance)
      ? comp.subject_dominance
      : "moderate",
  };
}

/**
 * Normalize MoodDna from either the DTO shape or the Gemini shape.
 * Merges data from both `mood_dna` and `color_profile` to produce the unified type.
 */
// biome-ignore lint/suspicious/noExplicitAny: Normalizing untyped mood data
export function normalizeMoodDna(
  moodDna: any,
  fallbackTemp?: "warm" | "cold",
  fallbackPrimaryColor?: string,
): MoodDna {
  return {
    temp: VALID_TEMPS.includes(moodDna?.temp)
      ? moodDna.temp
      : fallbackTemp || "warm",
    primary_color: moodDna?.primary_color || fallbackPrimaryColor || "neutral",
    vibe: moodDna?.vibe || "neutral",
    emotional_intensity: moodDna?.emotional_intensity || "medium",
    rhythm: moodDna?.rhythm || "calm",
  };
}
