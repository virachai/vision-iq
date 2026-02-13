import {
  GoogleGenAI,
  type LiveServerMessage,
  Modality,
  type Part,
  type Session,
} from "@google/genai";
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
  private readonly modelName =
    "models/gemini-2.5-flash-native-audio-preview-12-2025";
  private readonly maxRetries = 3;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY || "";
    this.ai = new GoogleGenAI({ apiKey });

    if (!apiKey) {
      this.logger.error("GEMINI_API_KEY not configured.");
    }
  }

  /**
   * Analyze a single image via Gemini Live session (with retries)
   */
  async analyzeImage(
    imageUrl: string,
  ): Promise<{ result: GeminiAnalysisResult; rawResponse: string }> {
    const { imageBase64, imageMime } = await this.fetchImageData(imageUrl);

    const fullText = await this.runLiveSessionWithRetry(
      this.getSingleAnalysisPrompt(),
      [
        { text: "Analyze this image and return only the JSON." },
        { inlineData: { mimeType: imageMime, data: imageBase64 } },
      ],
      60_000,
    );

    return this.parseGeminiResponse(fullText);
  }

  // ... (analyzeImages definition skipped for brevity, will touch if needed but focussing on single analysis first as per queue usage)

  // ...

  /**
   * Analyze multiple images in a single Gemini Live session.
   * Each image is labeled so Gemini returns keyed results.
   * Recommended max ~10 images per batch.
   */
  async analyzeImages(
    items: BatchAnalysisItem[],
  ): Promise<BatchAnalysisResult[]> {
    if (items.length === 0) return [];

    if (items.length === 1) {
      try {
        const { result } = await this.analyzeImage(items[0].imageUrl);
        return [{ id: items[0].id, result }];
      } catch (error) {
        return [{ id: items[0].id, error: (error as Error).message }];
      }
    }

    // Fetch all images in parallel
    const imageDataArr = await Promise.allSettled(
      items.map((item) => this.fetchImageData(item.imageUrl)),
    );

    const results: BatchAnalysisResult[] = items.map((item) => ({
      id: item.id,
    }));

    const parts: Part[] = [];
    const validIndices: number[] = [];

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

      parts.push({ text: `[IMAGE_${i}] id="${items[i].id}"` });
      parts.push({
        inlineData: { mimeType: imageMime, data: imageBase64 },
      });
    }

    if (validIndices.length === 0) return results;

    parts.unshift({
      text: `Analyze all ${validIndices.length} images below. Return a JSON array with one object per image, in the same order. Each object must include the "id" field matching the provided id.`,
    });

    try {
      const timeoutMs = 60_000 + validIndices.length * 15_000;

      const fullText = await this.runLiveSessionWithRetry(
        this.getBatchAnalysisPrompt(),
        parts,
        timeoutMs,
      );

      const parsed = this.parseBatchResponse(fullText);

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

      for (const idx of validIndices) {
        results[idx].error = `Batch analysis failed: ${
          (error as Error).message
        }`;
      }
      return results;
    }
  }

  // ---------------------------------------------------------------------------
  // Live session runner with retry
  // ---------------------------------------------------------------------------

  private async runLiveSessionWithRetry(
    systemPrompt: string,
    userParts: Part[],
    timeoutMs: number,
  ): Promise<string> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.runLiveSession(systemPrompt, userParts, timeoutMs);
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `Live session attempt ${attempt}/${this.maxRetries} failed: ${lastError.message}`,
        );

        if (attempt < this.maxRetries) {
          const delay = attempt * 2000; // 2s, 4s backoff
          this.logger.debug(`Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Open a Gemini Live session, send content, wait for turn completion,
   * then close and return accumulated text.
   */
  private runLiveSession(
    systemPrompt: string,
    userParts: Part[],
    timeoutMs: number,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let session: Session | undefined;
      let fullText = "";
      let turnCompleted = false;
      let settled = false;
      let timeoutHandle: ReturnType<typeof setTimeout>;

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);

        if (session) {
          try {
            session.close();
          } catch {}
          session = undefined;
        }

        if (error) {
          reject(error);
        } else if (!fullText.trim()) {
          reject(new Error("Gemini returned empty response"));
        } else {
          resolve(fullText);
        }
      };

      // Timeout
      timeoutHandle = setTimeout(() => {
        this.logger.error(
          `Gemini Live timeout after ${timeoutMs}ms (received ${fullText.length} chars so far)`,
        );
        finish(new Error("Gemini Live timeout"));
      }, timeoutMs);

      this.ai.live
        .connect({
          model: this.modelName,
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: {
              parts: [{ text: systemPrompt }],
            },
          },
          callbacks: {
            onopen: () => {
              this.logger.debug("Gemini Live session opened");
            },

            onmessage: (message: LiveServerMessage) => {
              const content = message.serverContent;

              const parts = content?.modelTurn?.parts;
              if (parts) {
                for (const part of parts) {
                  if (part.text) {
                    fullText += part.text;
                  }
                }
              }

              if (content?.turnComplete) {
                turnCompleted = true;
                this.logger.debug(
                  `Turn completed, received ${fullText.length} chars`,
                );
                finish();
              }
            },

            onerror: (err) => {
              this.logger.error("Gemini Live session error", err.message);
              finish(new Error(`Gemini Live error: ${err.message}`));
            },

            onclose: () => {
              this.logger.debug(
                `Gemini Live session closed (turnCompleted=${turnCompleted}, chars=${fullText.length})`,
              );
              // If the server closed before turn completed, fail immediately
              if (!turnCompleted) {
                finish(
                  new Error(
                    `Gemini Live session closed unexpectedly (received ${fullText.length} chars)`,
                  ),
                );
              }
            },
          },
        })
        .then((s) => {
          if (settled) return; // Already failed
          session = s;

          this.logger.debug("Sending content to Gemini Live session...");

          // Send all parts as a single user turn
          session.sendClientContent({
            turns: [{ role: "user", parts: userParts }],
          });
        })
        .catch((err) => {
          this.logger.error(
            "Failed to connect to Gemini Live",
            (err as Error).message,
          );
          finish(
            new Error(
              `Gemini Live connection failed: ${(err as Error).message}`,
            ),
          );
        });
    });
  }

  // ---------------------------------------------------------------------------
  // Prompts
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Data fetching & parsing
  // ---------------------------------------------------------------------------

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

    this.logger.debug(
      `Fetched image: ${imageMime}, ${Math.round(buffer.byteLength / 1024)}KB`,
    );

    return { imageBase64, imageMime };
  }

  private parseGeminiResponse(content: string): {
    result: GeminiAnalysisResult;
    rawResponse: string;
  } {
    try {
      const jsonStr = this.extractJson(content);
      const parsed = JSON.parse(jsonStr);
      return { result: this.normalizeResult(parsed), rawResponse: content };
    } catch (error) {
      this.logger.error(
        "Failed to parse Gemini response",
        (error as Error).message,
      );
      // Fallback: return a safe default object to avoid crashing
      this.logger.warn(`Raw content was: ${content}`);
      return { result: this.normalizeResult({}), rawResponse: content };
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: Parsing untyped Gemini JSON response
  private parseBatchResponse(content: string): any[] {
    try {
      const jsonStr = this.extractJson(content);
      const parsed = JSON.parse(jsonStr);

      if (Array.isArray(parsed)) return parsed;
      if (parsed.results && Array.isArray(parsed.results))
        return parsed.results;
      if (parsed.images && Array.isArray(parsed.images)) return parsed.images;

      return [parsed];
    } catch (error) {
      this.logger.error(
        "Failed to parse batch Gemini response",
        (error as Error).message,
      );
      // Fallback: return empty array so the batch process doesn't crash entirely
      this.logger.warn(`Raw content was: ${content}`);
      return [];
    }
  }

  /**
   * Robustly extract JSON from a string that might contain markdown or other text.
   * Finds the first '{' and the last '}', or '[' and ']'.
   */
  private extractJson(text: string): string {
    let s = text.trim();

    // 1. Try to find a JSON object
    const objectMatch = s.match(/\{[\s\S]*\}/);
    // 2. Try to find a JSON array
    const arrayMatch = s.match(/\[[\s\S]*\]/);

    if (objectMatch && arrayMatch) {
      // If both exist, take the one that starts earlier (or is longer/outermost)
      // Usually, we expect either an object or an array as the *root* element.
      // A simple heuristic: check which one starts first.
      if (objectMatch.index! < arrayMatch.index!) {
        return objectMatch[0];
      }
      return arrayMatch[0];
    }

    if (objectMatch) return objectMatch[0];
    if (arrayMatch) return arrayMatch[0];

    // If no JSON structure found, return the original string (will likely fail JSON.parse)
    return s
      .replace(/^```json\n?/, "")
      .replace(/^```\n?/, "")
      .replace(/\n?```$/, "");
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
