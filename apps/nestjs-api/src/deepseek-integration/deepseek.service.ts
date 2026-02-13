import { Injectable, Logger } from "@nestjs/common";
import axios, { type AxiosError } from "axios";
import type {
  Composition,
  SceneIntentDto,
} from "../alignment/dto/scene-intent.dto";
import type { GeminiAnalysisResult } from "../image-analysis/gemini-analysis.service";

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
}

@Injectable()
export class DeepSeekService {
  private readonly logger = new Logger(DeepSeekService.name);
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly model = "deepseek-chat";

  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY || "";
    this.apiUrl =
      process.env.DEEPSEEK_API_URL ||
      "https://api.deepseek.com/chat/completions";

    if (!this.apiKey) {
      this.logger.warn("DEEPSEEK_API_KEY not configured");
    }
  }

  /**
   * Parse raw Gemini Live text into structured scene intents
   * Single scene per call (as per requirements)
   */
  async extractVisualIntent(rawGeminiText: string): Promise<SceneIntentDto[]> {
    try {
      // Prompt design: instruct model to extract scene visual intent
      const systemPrompt = `You are an expert film director who analyzes narrative scripts and extracts visual intent for each scene.
For each scene in the text, extract:
1. intent: A concrete visual description (e.g., "a lone figure standing in an endless field at sunset")
2. required_impact: A score 1-10 where the subject prominence matters (1=background, 10=primary focus)
3. preferred_composition: An object with negative_space (left/right/center), shot_type (CU/MS/WS), angle (low/eye/high)

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
        required_impact: Math.min(10, Math.max(1, scene.required_impact || 5)),
        preferred_composition: this.validateComposition(
          scene.preferred_composition,
        ),
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
   * Parse granular cinematic analysis metadata from Gemini's raw textual output
   * Handles both single and batch results by detecting IMAGE_ID: or multiple blocks
   */
  async parseGeminiRawResponse(
    rawText: string,
  ): Promise<GeminiAnalysisResult[]> {
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
      return parsed.map((item) => this.normalizeGeminiResult(item));
    } catch (error) {
      this.logger.error(
        "DeepSeek raw parsing failed",
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
  private normalizeGeminiResult(parsed: any): GeminiAnalysisResult {
    return {
      impact_score: Math.min(10, Math.max(1, parsed?.impact_score || 5)),
      visual_weight: Math.min(10, Math.max(1, parsed?.visual_weight || 5)),
      composition: {
        negative_space: ["left", "right", "center"].includes(
          parsed?.composition?.negative_space,
        )
          ? parsed.composition.negative_space
          : "center",
        shot_type: ["CU", "MS", "WS"].includes(parsed?.composition?.shot_type)
          ? parsed.composition.shot_type
          : "MS",
        angle: ["low", "eye", "high"].includes(parsed?.composition?.angle)
          ? parsed.composition.angle
          : "eye",
        balance: ["symmetrical", "asymmetrical"].includes(
          parsed?.composition?.balance,
        )
          ? parsed.composition.balance
          : "asymmetrical",
        subject_dominance: ["weak", "moderate", "strong"].includes(
          parsed?.composition?.subject_dominance,
        )
          ? parsed.composition.subject_dominance
          : "moderate",
      },
      color_profile: {
        temperature: ["warm", "cold"].includes(
          parsed?.color_profile?.temperature,
        )
          ? parsed.color_profile.temperature
          : "warm",
        primary_color: parsed?.color_profile?.primary_color || "neutral",
        secondary_colors: Array.isArray(parsed?.color_profile?.secondary_colors)
          ? parsed.color_profile.secondary_colors
          : [],
        contrast_level: ["low", "medium", "high"].includes(
          parsed?.color_profile?.contrast_level,
        )
          ? parsed.color_profile.contrast_level
          : "medium",
      },
      mood_dna: {
        vibe: parsed?.mood_dna?.vibe || "cinematic",
        emotional_intensity: parsed?.mood_dna?.emotional_intensity || "medium",
        rhythm: parsed?.mood_dna?.rhythm || "calm",
      },
      metaphorical_tags: Array.isArray(parsed?.metaphorical_tags)
        ? parsed.metaphorical_tags
        : [],
      cinematic_notes: parsed?.cinematic_notes || "",
    };
  }

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
    const validNegativeSpaces = ["left", "right", "center"];
    const validShotTypes = ["CU", "MS", "WS"];
    const validAngles = ["low", "eye", "high"];

    return {
      negative_space: validNegativeSpaces.includes(comp?.negative_space)
        ? comp.negative_space
        : "center",
      shot_type: validShotTypes.includes(comp?.shot_type)
        ? comp.shot_type
        : "MS",
      angle: validAngles.includes(comp?.angle) ? comp.angle : "eye",
    };
  }
}
