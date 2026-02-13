import { Injectable, Logger } from "@nestjs/common";
import { WebSocket } from "ws";

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

@Injectable()
export class GeminiAnalysisService {
  private readonly logger = new Logger(GeminiAnalysisService.name);
  private readonly apiKey: string;
  private readonly modelName = "gemini-2.0-flash-exp"; // Suggested model for live

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || "";

    if (!this.apiKey) {
      this.logger.error("GEMINI_API_KEY not configured. Analysis will fail.");
    }
  }

  /**
   * Analyze image using Gemini Multimodal Live API via WebSockets
   */
  async analyzeImage(imageUrl: string): Promise<GeminiAnalysisResult> {
    try {
      const { imageBase64, imageMime } = await this.fetchImageData(imageUrl);

      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
      const ws = new WebSocket(url);

      let fullText = "";

      return new Promise<GeminiAnalysisResult>((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.terminate();
          reject(new Error("Timeout waiting for Gemini Live response"));
        }, 30000);

        ws.on("open", () => {
          this.logger.debug("Gemini Live WebSocket opened");

          // 1. Send Setup
          const setup = {
            setup: {
              model: `models/${this.modelName}`,
              generationConfig: {
                responseModalities: ["text"],
              },
              systemInstruction: {
                parts: [{ text: this.getAnalysisPrompt() }],
              },
            },
          };
          ws.send(JSON.stringify(setup));

          // 2. Send Content
          const content = {
            clientContent: {
              turns: [
                {
                  role: "user",
                  parts: [
                    {
                      text: "Analyze this image and return only the JSON.",
                    },
                    {
                      inlineData: {
                        data: imageBase64,
                        mimeType: imageMime,
                      },
                    },
                  ],
                },
              ],
            },
          };
          ws.send(JSON.stringify(content));
        });

        ws.on("message", (data) => {
          try {
            const message = JSON.parse(data.toString());

            // Check for setup completion or errors in serverContent
            if (message.setupComplete) {
              this.logger.debug("Gemini Live setup completed");
            }

            if (message.serverContent?.error) {
              this.logger.error(
                "Gemini Live API error",
                message.serverContent.error,
              );
              clearTimeout(timeout);
              ws.terminate();
              reject(
                new Error(
                  `Gemini Live API error: ${message.serverContent.error.message}`,
                ),
              );
              return;
            }

            // Handle serverContent
            if (message.serverContent?.modelTurn?.parts) {
              for (const part of message.serverContent.modelTurn.parts) {
                if (part.text) {
                  fullText += part.text;
                }
              }
            }

            // Check for completion
            if (message.serverContent?.turnComplete) {
              clearTimeout(timeout);
              ws.close();
              try {
                const parsedResult = this.parseGeminiResponse(fullText);
                resolve(parsedResult);
              } catch (parseErr) {
                reject(parseErr);
              }
            }
          } catch (err) {
            this.logger.error("Failed to process WebSocket message", err);
          }
        });

        ws.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });

        ws.on("close", (code, reason) => {
          this.logger.debug(`WebSocket closed: code=${code}, reason=${reason}`);
        });
      });
    } catch (error) {
      this.logger.error("Image analysis failed", (error as Error).message);
      throw new Error(`Gemini analysis failed: ${(error as Error).message}`);
    }
  }

  /**
   * Generate analysis prompt for Gemini
   */
  private getAnalysisPrompt(): string {
    return `You are a professional film cinematographer analyzing visual composition and mood.

Analyze this image and extract the following in JSON format:

1. impact_score (1-10): How prominent is the main subject? (1=barely visible, 10=fills frame)
2. visual_weight (1-10): Visual strength via contrast, saturation, clarity (1=flat, 10=striking)
3. composition: 
   - negative_space: "left" | "right" | "center" (where is empty space?)
   - shot_type: "CU" | "MS" | "WS" (Close-Up, Medium Shot, Wide Shot)
   - angle: "low" | "eye" | "high" (camera angle relative to subject)
4. mood_dna:
   - temp: "warm" | "cold" (color temperature)
   - primary_color: "#RRGGBB" (dominant color as hex)
   - vibe: string (descriptive mood e.g., "melancholic", "cinematic", "ethereal")
5. metaphorical_tags: array of 5-10 abstract concepts this image evokes
   Examples: ["loneliness", "breakthrough", "journey", "decay", "hope"]

Return ONLY valid JSON, no markdown, no explanation.`;
  }

  /**
   * Fetch image and return base64 and mime type
   */
  private async fetchImageData(
    imageUrl: string,
  ): Promise<{ imageBase64: string; imageMime: string }> {
    try {
      // Use fetch as axios might be redundant now if we want to minimize deps,
      // but keeping standard fetch or axios is fine. Using standard fetch here since it's available in Node 18+
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);

      const buffer = Buffer.from(await res.arrayBuffer());
      const imageBase64 = buffer.toString("base64");

      // Attempt to get mime from header if possible
      const imageMime = res.headers.get("content-type") || "image/jpeg";

      return { imageBase64, imageMime };
    } catch (error) {
      this.logger.error(
        `Failed to fetch image at ${imageUrl}`,
        (error as Error).message,
      );
      throw error;
    }
  }

  /**
   * Parse Gemini response into typed result
   */
  private parseGeminiResponse(content: string): GeminiAnalysisResult {
    try {
      let jsonStr = content.trim();
      if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.replace(/^```json\n?/, "").replace(/\n?```$/, "");
      } else if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```\n?/, "").replace(/\n?```$/, "");
      }

      const parsed = JSON.parse(jsonStr);

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
    } catch (error) {
      this.logger.error(
        "Failed to parse Gemini response",
        (error as Error).message,
      );
      throw new Error(`Invalid JSON from Gemini: ${(error as Error).message}`);
    }
  }
}
