import { Injectable, Logger } from "@nestjs/common";
import axios, { type AxiosError } from "axios";
import type { SceneIntentDto } from "../alignment/dto/scene-intent.dto";
import {
  type Composition,
  type GeminiAnalysisResult,
  normalizeGeminiResult,
  normalizeComposition,
} from "../shared/pipeline-types";

interface DeepSeekResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface ParsedScene {
  intent: string;
  required_impact: number;
  preferred_composition: Composition;
  visual_intent?: {
    emotional_layer?: {
      intent_words: string[];
      vibe: string;
    };
    spatial_strategy?: {
      strategy_words: string[];
      shot_type: string;
      balance: string;
    };
    subject_treatment?: {
      treatment_words: string[];
      identity: string;
      dominance: string;
    };
    color_mapping?: {
      temperature_words: string[];
      temperature: "warm" | "cold";
      contrast: "low" | "medium" | "high";
    };
  };
}

interface ExpandedIntentItem {
  description?: string;
  analysis?: {
    keywords?: string[] | string;
    mood_score?: number;
    [key: string]: unknown;
  };
}

@Injectable()
export class DeepSeekService {
  private readonly logger = new Logger(DeepSeekService.name);
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly model = "deepseek-chat";
  private readonly isEnabled: boolean;

  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY || "";
    this.apiUrl =
      process.env.DEEPSEEK_API_URL ||
      "https://api.deepseek.com/chat/completions";
    this.isEnabled = process.env.ENABLE_DEEPSEEK === "true";

    if (!this.apiKey) {
      this.logger.warn("DEEPSEEK_API_KEY not configured");
    }

    if (this.isEnabled) {
      this.logger.log("DeepSeek analysis is ENABLED");
    } else {
      this.logger.warn(
        "DeepSeek analysis is DISABLED via ENABLE_DEEPSEEK flag",
      );
    }
  }

  get isDeepSeekEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Parse raw Gemini Live text into structured scene intents
   * Single scene per call (as per requirements)
   */
  async extractVisualIntent(rawGeminiText: string): Promise<SceneIntentDto[]> {
    if (!this.isEnabled) {
      this.logger.debug("Skipping extractVisualIntent: DeepSeek disabled");
      return [
        {
          intent: rawGeminiText.substring(0, 100),
          requiredImpact: 5,
          preferredComposition: this.validateComposition({}),
        },
      ];
    }
    try {
      // Prompt design: instruct model to extract scene visual intent
      const systemPrompt = `You are an expert film director who analyzes narrative scripts and extracts visual intent for each scene.
For each scene in the text, extract:
1. intent: A concrete visual description (e.g., "a lone figure standing in an endless field at sunset")
2. required_impact: A score 1-10 where the subject prominence matters (1=background, 10=primary focus)
3. preferred_composition: An object with negative_space (left/right/center), shot_type (CU/MS/WS), angle (low/eye/high)
4. visual_intent: A structured object covering 4 distinct layers:
   - emotional_layer: { intent_words: string[], vibe: string } // e.g., ["overwhelmed", "suffocation"], "oppressive"
   - spatial_strategy: { strategy_words: string[], shot_type: string, balance: string } // e.g., ["negative space center", "wide shot"]
   - subject_treatment: { treatment_words: string[], identity: string, dominance: string } // e.g., ["hidden face", "vulnerable posture"], "concealed", "overwhelmed"
   - color_mapping: { temperature_words: string[], temperature: "warm" | "cold", contrast: "low" | "medium" | "high" }

Return ONLY a valid JSON array of scenes, no markdown, no explanations.
Example:
[
  {
    "intent": "A solitary figure overlooking a vast canyon at golden hour",
    "required_impact": 8,
    "preferred_composition": {
      "negative_space": "left",
      "shot_type": "WS",
      "angle": "eye"
    },
    "visual_intent": {
      "emotional_layer": { "intent_words": ["vulnerable", "isolated"], "vibe": "lonely" },
      "spatial_strategy": { "strategy_words": ["wide shot", "negative space left"], "shot_type": "WS", "balance": "asymmetrical" },
      "subject_treatment": { "treatment_words": ["small posture", "vulnerable"], "identity": "partial", "dominance": "overwhelmed" },
      "color_mapping": { "temperature_words": ["warm tone", "golden hour"], "temperature": "warm", "contrast": "medium" }
    }
  }
]`;

      const userPrompt = `Parse this narrative text and extract scene visual intents:\n\n${rawGeminiText}`;

      const response = await this.callDeepSeekAPI(systemPrompt, userPrompt);

      // Parse response
      const parsed: ParsedScene[] = this.parseJsonResponse(response.content);

      // Validate and convert to DTOs
      const scenes = parsed.map((scene) => ({
        intent: scene.intent || "",
        requiredImpact: Math.min(10, Math.max(1, scene.required_impact || 5)),
        preferredComposition: this.validateComposition(
          scene.preferred_composition,
        ),
        visualIntent: scene.visual_intent,
      }));

      this.logger.debug(`Extracted ${scenes.length} scenes from gemini text`);
      return scenes;
    } catch (error) {
      this.logger.error(
        "Failed to extract visual intent from Gemini text",
        error,
      );
      throw new Error(
        `DeepSeek extraction failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Expand a single scene intent into multiple highly detailed visual descriptions
   * Optimized for diverse image search coverage
   */
  async expandSceneIntent(
    intent: string,
    count = 3,
  ): Promise<{ description: string; analysis: unknown }[]> {
    if (!this.isEnabled) {
      this.logger.debug("Skipping expandSceneIntent: DeepSeek disabled");
      return [
        {
          description: intent,
          analysis: { keywords: [intent], mood_score: 5 },
        },
      ];
    }
    this.logger.debug(
      `Expanding intent: "${intent}" into ${count} descriptions`,
    );

    const systemPrompt = `You are an expert cinematic visual researcher. Your task is to take a core visual intent and expand it into ${count} distinct, highly detailed visual descriptions (prompts) that could be used for image search or generation.
    
    Each expanded description should maintain the core intent but explore different:
    - Lighting setups (e.g., moody noir, bright airy, neon-drenched)
    - Environments/Settings (e.g., urban, natural, abstract)
    - Camera perspectives that align with the core idea.
    
    Return a valid JSON array of objects, where each object has:
    1. description: The detailed visual prompt (2-3 sentences)
    2. analysis: A small JSON object with "keywords" (array) and "mood_score" (1-10)
    
    Return ONLY valid JSON, no markdown.`;

    const userPrompt = `Expand this visual intent: "${intent}"`;

    try {
      const response = await this.callDeepSeekAPI(systemPrompt, userPrompt);
      const parsed = this.parseJsonResponse(
        response.content,
      ) as ExpandedIntentItem[];

      return parsed.map((item) => {
        const analysis = item.analysis || {};
        // Ensure keywords is always an array
        if (analysis.keywords && !Array.isArray(analysis.keywords)) {
          analysis.keywords =
            typeof analysis.keywords === "string"
              ? analysis.keywords.split(",").map((k: string) => k.trim())
              : [analysis.keywords];
        }
        return {
          description: item.description || "",
          analysis: analysis,
        };
      });
    } catch (error) {
      this.logger.error("Intent expansion failed", (error as Error).message);
      // Fallback to the original intent
      return [
        {
          description: intent,
          analysis: { keywords: [intent], mood_score: 5 },
        },
      ];
    }
  }

  /**
   * Parse granular cinematic analysis metadata from Gemini's raw textual output
   * Handles both single and batch results by detecting IMAGE_ID: or multiple blocks
   */
  async parseGeminiRawResponse(
    rawText: string,
  ): Promise<GeminiAnalysisResult[]> {
    if (!this.isEnabled) {
      this.logger.debug("Skipping parseGeminiRawResponse: DeepSeek disabled");
      return [];
    }
    this.logger.debug(
      `Parsing Gemini raw response with DeepSeek (${rawText.length} chars)`,
    );

    const systemPrompt = `You are an expert cinematic consultant. Your task is to extract structured visual analysis metadata from a conversational or raw text response provided by another AI.

The input may contain one or many image analysis blocks. Each block should be converted into a structured JSON object.

REQUIRED STRUCTURE PER IMAGE:
{
  "impact_score": number (1-10),
  "visual_weight": number (1-10),
  "composition": {
    "negative_space": "left" | "right" | "center",
    "shot_type": "CU" | "MS" | "WS",
    "angle": "low" | "eye" | "high",
    "balance": "symmetrical" | "asymmetrical",
    "subject_dominance": "weak" | "moderate" | "strong"
  },
  "color_profile": {
    "temperature": "warm" | "cold",
    "primary_color": "string (color name)",
    "secondary_colors": ["string", "string"],
    "contrast_level": "low" | "medium" | "high"
  },
  "mood_dna": {
    "vibe": "string (1-3 words)",
    "emotional_intensity": "string",
    "rhythm": "string"
  },
  "metaphorical_tags": ["string", "string"],
  "cinematic_notes": "string (3-5 sentences)"
}

If the input refers to multiple images (e.g., using "IMAGE_ID: <id>" or describing different scenes), return multiple objects in a JSON array.

Return ONLY the valid JSON, no markdown, no explanations.`;

    const userPrompt = `Extract cinematic metadata from this raw text:\n\n${rawText}`;

    try {
      const response = await this.callDeepSeekAPI(systemPrompt, userPrompt);
      const parsed = this.parseJsonResponse(
        response.content,
      ) as unknown as GeminiAnalysisResult[];

      // Normalize each result
      return parsed.map((item) => normalizeGeminiResult(item));
    } catch (error) {
      this.logger.error(
        "DeepSeek raw parsing failed",
        (error as Error).message,
      );
      throw error;
    }
  }

  /**
   * Analyze high-depth visual intent across 7 cinematic layers.
   * Based on a rich textual description of an image.
   */
  async analyzeDetailedVisualIntent(rawDescription: string): Promise<any> {
    if (!this.isEnabled) {
      this.logger.debug(
        "Skipping analyzeDetailedVisualIntent: DeepSeek disabled",
      );
      return null;
    }
    this.logger.debug(
      `Analyzing detailed visual intent with DeepSeek (${rawDescription.length} chars)`,
    );

    const systemPrompt = `You are an expert cinematic director and visual strategist. 
Your task is to analyze a rich visual description of an image and extract exactly 7 layers of cinematic intent into a structured JSON object.

REQUIRED JSON STRUCTURE:
{
  "coreIntent": {
    "intent": "string (The core narrative loading/objective)",
    "visual_goal": "string (What the viewer should feel/understand)"
  },
  "spatialStrategy": {
    "shot_type": "WS" | "MS" | "CU" | "ECU",
    "negative_space": "string (how negative space is used to support the intent)",
    "balance": "symmetrical" | "asymmetrical" | "off-balance"
  },
  "subjectTreatment": {
    "identity": "concealed" | "revealed" | "partial",
    "dominance": "hero" | "submissive" | "overwhelmed",
    "eye_contact": "direct" | "none" | "averted"
  },
  "colorPsychology": {
    "palette": ["string", "string"],
    "contrast": "low" | "medium" | "high",
    "mood": "string (emotional response triggered by colors)"
  },
  "emotionalArchitecture": {
    "vibe": "string (the overarching atmosphere)",
    "rhythm": "static" | "chaotic" | "flowing" | "still",
    "intensity": "low" | "medium" | "high"
  },
  "metaphoricalLayer": {
    "objects": ["string=string (symbolism, e.g., 'cracked glass=broken trust')"],
    "meaning": "string (the deeper subtextual interpretation)"
  },
  "cinematicLeverage": {
    "angle": "string (camera angle description)",
    "lighting": "string (lighting style and direction)",
    "sound": "string (implied sound or diegetic texture)"
  }
}

Return ONLY the valid JSON, no markdown, no explanations.`;

    const userPrompt = `Analyze this visual description and extract the 7 cinematic layers:\n\n${rawDescription}`;

    try {
      const response = await this.callDeepSeekAPI(systemPrompt, userPrompt);
      const parsed = this.parseJsonResponse(response.content);
      // parsed is returned as an array by parseJsonResponse if it's not one,
      // but here we expect a single object.
      return Array.isArray(parsed) ? parsed[0] : parsed;
    } catch (error) {
      this.logger.error(
        "DeepSeek detailed intent analysis failed",
        (error as Error).message,
      );
      throw error;
    }
  }

  /**
   * Extract 2-3 searchable keywords from a long visual intent
   * Optimized for Pexels API search
   */
  async extractSearchKeywords(intent: string): Promise<string> {
    if (!this.isEnabled) {
      this.logger.debug("Skipping extractSearchKeywords: DeepSeek disabled");
      return intent.split(" ").slice(0, 3).join(" ");
    }
    this.logger.debug(`Extracting keywords for intent: "${intent}"`);

    const systemPrompt = `You are an expert image researcher. Your task is to condense a visual description into 2-3 searchable keywords for an image bank (Pexels).

Focus on:
- Primary subjects (e.g., "solitary figure", "mountain", "cyberpunk city")
- Lighting/Environment (e.g., "sunset", "neon", "misty")
- Color/Style (e.g., "golden hour", "minimalist")

Return ONLY the keywords separated by spaces, no punctuation, no explanations.
Example: 
Input: "A lone figure standing on a vast salt flat under a purple twilight sky"
Output: "solitary person salt flat twilight"`;

    const userPrompt = `Extract keywords for: "${intent}"`;

    try {
      const response = await this.callDeepSeekAPI(systemPrompt, userPrompt);
      const keywords = response.content.trim().replace(/['"]/g, "");
      this.logger.debug(`Extracted keywords: "${keywords}"`);
      return keywords;
    } catch (error) {
      this.logger.error(
        "Keyword extraction failed, falling back to original intent",
        (error as Error).message,
      );
      // Fallback: return the first few words of the intent
      return intent.split(" ").slice(0, 3).join(" ");
    }
  }

  /**
   * Normalize and validate GeminiAnalysisResult from raw JSON input
   */
  // normalizeGeminiResult removed — use shared normalizeGeminiResult() from pipeline-types

  /**
   * Call DeepSeek API with exponential backoff for rate limiting
   */
  private async callDeepSeekAPI(
    systemPrompt: string,
    userPrompt: string,
    retryCount = 0,
  ): Promise<{ content: string }> {
    const maxRetries = 3;

    try {
      const response = await axios.post<DeepSeekResponse>(
        this.apiUrl,
        {
          model: this.model,
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: userPrompt,
            },
          ],
          temperature: 0.3, // Lower temperature for consistency
          max_tokens: 2000,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        },
      );

      const content = response.data.choices[0]?.message?.content || "";
      return { content };
    } catch (error) {
      const axiosError = error as AxiosError;

      // Handle rate limiting with exponential backoff
      if (axiosError.response?.status === 429 && retryCount < maxRetries) {
        const delay = 2 ** retryCount * 1000; // 1s, 2s, 4s
        this.logger.warn(`DeepSeek API rate limited, retrying in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.callDeepSeekAPI(systemPrompt, userPrompt, retryCount + 1);
      }

      this.logger.error("DeepSeek API call failed", axiosError.message);
      throw error;
    }
  }

  /**
   * Parse JSON from response, handling markdown code blocks
   */
  private parseJsonResponse(content: string): ParsedScene[] {
    try {
      // Remove markdown code blocks if present
      let jsonStr = content.trim();
      if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.replace(/^```json\n?/, "").replace(/\n?```$/, "");
      } else if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```\n?/, "").replace(/\n?```$/, "");
      }

      const parsed = JSON.parse(jsonStr);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      this.logger.error("Failed to parse DeepSeek JSON response", error);
      throw new Error(
        `Invalid JSON response from DeepSeek: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Validate and normalize composition object
   */
  // biome-ignore lint/suspicious/noExplicitAny: Validating unstructured JSON input
  private validateComposition(comp: any): Composition {
    return normalizeComposition(comp);
  }
}
