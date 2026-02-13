import { type Part, GoogleGenAI } from "@google/genai";
import { Injectable, Logger } from "@nestjs/common";

interface GeminiAnalysisResult {
  impact_score: number;
  visual_weight: number;
  composition: {
    negative_space: "left" | "right" | "center";
    shot_type: "CU" | "MS" | "WS";
    angle: "low" | "eye" | "high";
  };
  mood_dna: {
    temp: "warm" | "cold";
    primary_color: string;
    vibe: string;
  };
  metaphorical_tags: string[];
}

interface BatchAnalysisItem {
  imageUrl: string;
  id: string;
}

interface BatchAnalysisResult {
  id: string;
  result?: GeminiAnalysisResult;
  error?: string;
}

@Injectable()
export class GeminiAnalysisService {
  private readonly logger = new Logger(GeminiAnalysisService.name);
  private readonly ai: GoogleGenAI;
  private readonly modelName = "gemini-2.5-flash";

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY || "";
    this.ai = new GoogleGenAI({ apiKey });

    if (!apiKey) {
      this.logger.error("GEMINI_API_KEY not configured.");
    }
  }

  /**
   * Analyze a single image
   */
  async analyzeImage(imageUrl: string): Promise<GeminiAnalysisResult> {
    try {
      const { imageBase64, imageMime } = await this.fetchImageData(imageUrl);

      const response = await this.ai.models.generateContent({
        model: this.modelName,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "Analyze this image and return only the JSON.",
              },
              {
                inlineData: {
                  mimeType: imageMime,
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        config: {
          systemInstruction: this.getSingleAnalysisPrompt(),
          responseMimeType: "application/json",
        },
      });

      const fullText = response.text ?? "";

      return this.parseGeminiResponse(fullText);
    } catch (error) {
      this.logger.error("Image analysis failed", (error as Error).message);

      throw new Error(`Gemini analysis failed: ${(error as Error).message}`);
    }
  }

  /**
   * Analyze multiple images in a single Gemini API request.
   * Returns results keyed by the provided `id` for each image.
   * Max ~10 images per batch recommended to stay within token limits.
   */
  async analyzeImages(
    items: BatchAnalysisItem[],
  ): Promise<BatchAnalysisResult[]> {
    if (items.length === 0) return [];

    if (items.length === 1) {
      try {
        const result = await this.analyzeImage(items[0].imageUrl);
        return [{ id: items[0].id, result }];
      } catch (error) {
        return [{ id: items[0].id, error: (error as Error).message }];
      }
    }

    try {
      // Fetch all images in parallel
      const imageDataArr = await Promise.allSettled(
        items.map((item) => this.fetchImageData(item.imageUrl)),
      );

      // Build parts: label each image by index so Gemini returns keyed results
      const parts: Part[] = [];
      const validIndices: number[] = [];
      const results: BatchAnalysisResult[] = items.map((item) => ({
        id: item.id,
      }));

      for (let i = 0; i < items.length; i++) {
        const settled = imageDataArr[i];
        if (settled.status === "rejected") {
          results[i].error = `Failed to fetch image: ${
            settled.reason?.message ?? settled.reason
          }`;
          continue;
        }

        const { imageBase64, imageMime } = settled.value;
        validIndices.push(i);

        parts.push({
          text: `[IMAGE_${i}] id="${items[i].id}"`,
        });
        parts.push({
          inlineData: {
            mimeType: imageMime,
            data: imageBase64,
          },
        });
      }

      if (validIndices.length === 0) {
        return results;
      }

      parts.unshift({
        text: `Analyze all ${validIndices.length} images below. Return a JSON array with one object per image, in the same order. Each object must include the "id" field matching the provided id.`,
      });

      const response = await this.ai.models.generateContent({
        model: this.modelName,
        contents: [
          {
            role: "user",
            parts,
          },
        ],
        config: {
          systemInstruction: this.getBatchAnalysisPrompt(),
          responseMimeType: "application/json",
        },
      });

      const fullText = response.text ?? "";
      const parsed = this.parseBatchResponse(fullText);

      // Map parsed results back by id
      const parsedById = new Map<string, GeminiAnalysisResult>();
      for (const entry of parsed) {
        if (entry.id) {
          parsedById.set(entry.id, this.normalizeResult(entry));
        }
      }

      for (const idx of validIndices) {
        const id = items[idx].id;
        const analysisResult = parsedById.get(id);
        if (analysisResult) {
          results[idx].result = analysisResult;
        } else {
          results[idx].error = "Gemini did not return analysis for this image";
        }
      }

      return results;
    } catch (error) {
      this.logger.error(
        "Batch image analysis failed",
        (error as Error).message,
      );

      // Return all as errors
      return items.map((item) => ({
        id: item.id,
        error: `Batch analysis failed: ${(error as Error).message}`,
      }));
    }
  }

  private getSingleAnalysisPrompt(): string {
    return `You are a professional film cinematographer analyzing visual composition and mood.

Analyze this image and extract the following in JSON format:

1. impact_score (1-10)
2. visual_weight (1-10)
3. composition:
   - negative_space: "left" | "right" | "center"
   - shot_type: "CU" | "MS" | "WS"
   - angle: "low" | "eye" | "high"
4. mood_dna:
   - temp: "warm" | "cold"
   - primary_color: "#RRGGBB"
   - vibe: string
5. metaphorical_tags: array of 5-10 abstract concepts

Return ONLY valid JSON. No markdown. No explanation.`;
  }

  private getBatchAnalysisPrompt(): string {
    return `You are a professional film cinematographer analyzing visual composition and mood.

For EACH image, extract the following fields:
- id: the image id provided in the prompt (string)
- impact_score: (1-10)
- visual_weight: (1-10)
- composition:
   - negative_space: "left" | "right" | "center"
   - shot_type: "CU" | "MS" | "WS"
   - angle: "low" | "eye" | "high"
- mood_dna:
   - temp: "warm" | "cold"
   - primary_color: "#RRGGBB"
   - vibe: string
- metaphorical_tags: array of 5-10 abstract concepts

Return a JSON ARRAY of objects, one per image, in the same order as the images.
Each object MUST include the "id" field.
Return ONLY valid JSON. No markdown. No explanation.`;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Parsing untyped Gemini JSON response
  private parseBatchResponse(content: string): any[] {
    try {
      let jsonStr = content.trim();

      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr
          .replace(/^```json\n?/, "")
          .replace(/^```\n?/, "")
          .replace(/\n?```$/, "");
      }

      const parsed = JSON.parse(jsonStr);

      if (Array.isArray(parsed)) {
        return parsed;
      }

      // If Gemini returns a wrapper object, try common keys
      if (parsed.results && Array.isArray(parsed.results)) {
        return parsed.results;
      }
      if (parsed.images && Array.isArray(parsed.images)) {
        return parsed.images;
      }

      // Single object — wrap in array
      return [parsed];
    } catch (error) {
      this.logger.error(
        "Failed to parse batch Gemini response",
        (error as Error).message,
      );
      throw new Error(
        `Invalid JSON from Gemini batch: ${(error as Error).message}`,
      );
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: Normalizing untyped Gemini response fields
  private normalizeResult(parsed: any): GeminiAnalysisResult {
    return {
      impact_score: Math.min(10, Math.max(1, parsed.impact_score || 5)),
      visual_weight: Math.min(10, Math.max(1, parsed.visual_weight || 5)),
      composition: {
        negative_space: ["left", "right", "center"].includes(
          parsed.composition?.negative_space,
        )
          ? parsed.composition.negative_space
          : "center",
        shot_type: ["CU", "MS", "WS"].includes(parsed.composition?.shot_type)
          ? parsed.composition.shot_type
          : "MS",
        angle: ["low", "eye", "high"].includes(parsed.composition?.angle)
          ? parsed.composition.angle
          : "eye",
      },
      mood_dna: {
        temp: parsed.mood_dna?.temp === "cold" ? "cold" : "warm",
        primary_color: parsed.mood_dna?.primary_color || "#300880",
        vibe: parsed.mood_dna?.vibe || "neutral",
      },
      metaphorical_tags: Array.isArray(parsed.metaphorical_tags)
        ? parsed.metaphorical_tags.slice(0, 15)
        : [],
    };
  }

  private async fetchImageData(
    imageUrl: string,
  ): Promise<{ imageBase64: string; imageMime: string }> {
    const res = await fetch(imageUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch image: ${res.statusText}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const imageBase64 = buffer.toString("base64");
    const imageMime = res.headers.get("content-type") || "image/jpeg";

    return { imageBase64, imageMime };
  }

  private parseGeminiResponse(content: string): GeminiAnalysisResult {
    try {
      let jsonStr = content.trim();

      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr
          .replace(/^```json\n?/, "")
          .replace(/^```\n?/, "")
          .replace(/\n?```$/, "");
      }

      const parsed = JSON.parse(jsonStr);

      return this.normalizeResult(parsed);
    } catch (error) {
      this.logger.error(
        "Failed to parse Gemini response",
        (error as Error).message,
      );
      throw new Error(`Invalid JSON from Gemini: ${(error as Error).message}`);
    }
  }
}
