import {
  GoogleGenAI,
  type LiveServerMessage,
  Modality,
  type Part,
  type Session,
} from "@google/genai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Injectable, Logger, Inject } from "@nestjs/common";
import { PrismaClient } from "@repo/database";
import { PRISMA_SERVICE } from "../prisma/prisma.module";
import { DeepSeekService } from "../deepseek-integration/deepseek.service";
import {
  type GeminiAnalysisResult,
  type GradeLevel,
  type BatchAnalysisItem,
  type BatchAnalysisResult,
  normalizeGeminiResult,
} from "../shared/pipeline-types";

// Re-export for backward compatibility
export type {
  GeminiAnalysisResult,
  GradeLevel,
} from "../shared/pipeline-types";

interface GradeValidationResult {
  passed: boolean;
  score: number;
  failures: string[];
}

@Injectable()
export class GeminiAnalysisService {
  private readonly logger = new Logger(GeminiAnalysisService.name);
  private readonly ai: GoogleGenAI;
  private readonly restAi: GoogleGenerativeAI;
  private readonly modelName =
    "models/gemini-2.5-flash-native-audio-preview-12-2025";
  private readonly maxRetries = 3;
  private readonly isEnabled: boolean;

  constructor(
    private readonly deepseekService: DeepSeekService,
    @Inject(PRISMA_SERVICE) private readonly prisma: PrismaClient,
  ) {
    const apiKey = process.env.GEMINI_API_KEY || "";
    this.ai = new GoogleGenAI({ apiKey });
    this.restAi = new GoogleGenerativeAI(apiKey);
    this.isEnabled = process.env.ENABLE_GEMINI === "true";

    if (!apiKey) {
      this.logger.error("GEMINI_API_KEY not configured.");
    }

    if (this.isEnabled) {
      this.logger.log("Gemini analysis is ENABLED");
    } else {
      this.logger.warn("Gemini analysis is DISABLED via ENABLE_GEMINI flag");
    }
  }

  /**
   * Check if DeepSeek refinement is enabled
   */
  isDeepSeekRefinementEnabled(): boolean {
    return this.deepseekService.isDeepSeekEnabled;
  }

  /**
   * Analyze a single image via Gemini Live session (with retries)
   */
  async analyzeImage(
    imageUrl: string,
    level: GradeLevel = "none",
    alt?: string,
  ): Promise<{ result: GeminiAnalysisResult; rawResponse: string }> {
    if (!this.isEnabled) {
      this.logger.debug("Skipping analyzeImage: Gemini disabled");
      return {
        result: normalizeGeminiResult({} as any),
        rawResponse: "Gemini disabled - Fallback returned",
      };
    }
    const { imageBase64, imageMime } = await this.fetchImageData(imageUrl);

    const userParts: Part[] = [
      {
        text: "EXTRACT VISUAL METADATA. STRICT DATA MODE. NO CONVERSATION. NO MARKDOWN. START WITH 'IMPACT:'.",
      },
    ];

    if (alt) {
      userParts.push({ text: `HINT/ALT TEXT: ${alt}` });
    }

    userParts.push({
      inlineData: { mimeType: imageMime, data: imageBase64 },
    });

    const fullText = await this.runLiveSessionWithRetry(
      this.getSingleAnalysisPrompt(),
      userParts,
      60_000,
      level,
    );

    return this.parseGeminiResponse(fullText);
  }

  /**
   * Generate embedding for text using Gemini text-embedding-004
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isEnabled) {
      // Return random vector if disabled
      return new Array(768).fill(0).map(() => Math.random());
    }

    try {
      // Using @google/genai SDK pattern
      const response = await (this.ai as any).models.embedContent({
        model: "models/text-embedding-004",
        contents: [
          {
            parts: [{ text }],
          },
        ],
      });

      const values =
        response.embeddings?.[0]?.values || response.embedding?.values;

      if (!values) {
        throw new Error("No embedding returned from Gemini");
      }

      return values;
    } catch (error) {
      this.logger.error(
        "Failed to generate embedding",
        (error as Error).message,
      );
      throw error;
    }
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

    if (!this.isEnabled) {
      this.logger.debug("Skipping analyzeImages: Gemini disabled");
      return items.map((item) => ({
        id: item.id,
        result: normalizeGeminiResult({} as any),
      }));
    }

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

      parts.push({
        text: `[IMAGE_${i}] id="${items[i].id}"${
          (items[i] as any).alt ? ` alt="${(items[i] as any).alt}"` : ""
        }`,
      });
      parts.push({
        inlineData: { mimeType: imageMime, data: imageBase64 },
      });
    }

    if (validIndices.length === 0) return results;

    parts.unshift({
      text: "Analyze all images provided below using the format specified in the system instructions.",
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
          parsedById.set(entry.id, normalizeGeminiResult(entry));
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

  /**
   * Refine an existing analysis job using DeepSeek
   * Parses rawResponse text into structured metadata and updates DB
   */
  async refineWithDeepSeek(jobId: string): Promise<void> {
    if (!this.isEnabled) {
      this.logger.debug("Skipping refineWithDeepSeek: Gemini disabled");
      return;
    }
    const job = await this.prisma.imageAnalysisJob.findUnique({
      where: { id: jobId },
      include: { pexelsImage: true },
    });

    if (!job) throw new Error(`Analysis job ${jobId} not found`);
    if (!job.rawApiResponse)
      throw new Error(`No raw response to refine for job ${jobId}`);

    this.logger.log(`Refining analysis for job ${jobId} using DeepSeek...`);

    if (!this.deepseekService.isDeepSeekEnabled) {
      this.logger.warn(
        `DeepSeek refinement skipped for job ${jobId}: DeepSeek is disabled`,
      );
      await this.prisma.imageAnalysisJob.update({
        where: { id: jobId },
        data: {
          jobStatus: "COMPLETED",
          completedAt: new Date(),
          errorMessage: "Refinement skipped: DeepSeek disabled",
        },
      });
      return;
    }

    try {
      const refinedResults = await this.deepseekService.parseGeminiRawResponse(
        job.rawApiResponse as any,
      );

      if (refinedResults.length === 0) {
        throw new Error("DeepSeek could not extract any valid analysis data");
      }

      // We take the first result (usually 1:1, unless it was a batch that got merged into one job)
      const refined = refinedResults[0];

      // Update Structured DeepSeek Analysis Results
      await this.prisma.deepSeekAnalysis.upsert({
        where: { analysisJobId: jobId },
        update: {
          analysisResult: refined as any,
          confidenceScore: 1.0,
        },
        create: {
          analysisJobId: jobId,
          analysisResult: refined as any,
          confidenceScore: 1.0,
        },
      });

      // Update Job
      await this.prisma.imageAnalysisJob.update({
        where: { id: jobId },
        data: {
          jobStatus: "COMPLETED",
          completedAt: new Date(),
        },
      });

      this.logger.log(`Successfully refined job ${jobId}`);
    } catch (error) {
      this.logger.error(
        `Refinement failed for job ${jobId}`,
        (error as Error).message,
      );
      throw error;
    }
  }

  /**
   * Analyze Visual Intent: Core Intent, Spatial Strategy, etc.
   * Hybrid Flow: Gemini (Vision) -> DeepSeek (7-layer Analysis)
   * Saves directly to VisualIntentAnalysis table.
   */
  async analyzeVisualIntent(pexelsImageId: string): Promise<void> {
    if (!this.isEnabled) {
      this.logger.debug("Skipping analyzeVisualIntent: Gemini disabled");
      return;
    }
    const image = await this.prisma.pexelsImage.findUnique({
      where: { id: pexelsImageId },
    });

    if (!image) throw new Error(`PexelsImage ${pexelsImageId} not found`);

    this.logger.log(`Analyzing Visual Intent for image ${pexelsImageId}...`);

    const { imageBase64, imageMime } = await this.fetchImageData(image.url);

    const userParts: Part[] = [
      {
        text: "PROVIDE A RICH CINEMATIC DESCRIPTION OF THIS IMAGE. FOCUS ON INTENT AND CINEMATIC DIMENSIONS.",
      },
      {
        inlineData: { mimeType: imageMime, data: imageBase64 },
      },
    ];

    // 1. Get rich description from Gemini (The "Vision" part)
    const rawDescription = await this.runLiveSessionWithRetry(
      this.getRichDescriptionPrompt(),
      userParts,
      60_000,
    );

    this.logger.debug(
      `Gemini description length: ${rawDescription.length} chars`,
    );

    let result: any = null;
    if (this.deepseekService.isDeepSeekEnabled) {
      // 2. Extract 7-layer visual intent using DeepSeek (The "Brain" part)
      result = await this.deepseekService.analyzeDetailedVisualIntent(
        rawDescription,
      );
    } else {
      this.logger.warn(
        `Detailed visual intent analysis skipped for image ${pexelsImageId}: DeepSeek disabled`,
      );
      // Fallback: minimal result structure so upsert doesn't fail if we decide to save partials,
      // but for now let's just return to avoid saving incomplete analysis.
      return;
    }

    // 3. Persist to VisualIntentAnalysis table
    await this.prisma.visualIntentAnalysis.upsert({
      where: { pexelsImageId },
      create: {
        pexelsImageId,
        coreIntent: result.coreIntent as any,
        spatialStrategy: result.spatialStrategy as any,
        subjectTreatment: result.subjectTreatment as any,
        colorPsychology: result.colorPsychology as any,
        emotionalArchitecture: result.emotionalArchitecture as any,
        metaphoricalLayer: result.metaphoricalLayer as any,
        cinematicLeverage: result.cinematicLeverage as any,
      },
      update: {
        coreIntent: result.coreIntent as any,
        spatialStrategy: result.spatialStrategy as any,
        subjectTreatment: result.subjectTreatment as any,
        colorPsychology: result.colorPsychology as any,
        emotionalArchitecture: result.emotionalArchitecture as any,
        metaphoricalLayer: result.metaphoricalLayer as any,
        cinematicLeverage: result.cinematicLeverage as any,
      },
    });

    this.logger.log(
      `Successfully analyzed Visual Intent for image ${pexelsImageId}`,
    );
  }

  private getRichDescriptionPrompt(): string {
    return `
SYSTEM: You are a world-class cinematic visual analyst and director of photography.
TASK: Provide a high-density, descriptive analysis of the provided image.
FOCUS:
- Narrative and Emotional Intent: What story is being told? What is the core objective?
- Spatial Strategy: Analyze shot types, negative space, and compositional balance.
- Subject Treatment: How is the subject presented? Dominance, identity, posture.
- Color and Contrast: Palette choices, contrast levels, and their psychological impact.
- Metaphorical Elements: Identify symbols and their deeper meanings.
- Cinematic Techniques: Lighting, camera angles, and implied textures or sounds.

MODE: Descriptive English prose. Rich, evocative, and detailed. 
Avoid conversational fillers or "I see...". Start directly with the analysis.
`;
  }

  // ---------------------------------------------------------------------------
  // Live session runner with retry
  // ---------------------------------------------------------------------------

  private async runLiveSessionWithRetry(
    systemPrompt: string,
    userParts: Part[],
    timeoutMs: number,
    level: GradeLevel = "none",
  ): Promise<string> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const fullText = await this.runLiveSession(
          systemPrompt,
          userParts,
          timeoutMs,
        );

        // Skip grading for batch prompt (which is JSON-based still) or if level is 'none'
        if (systemPrompt.includes("IMAGE_ID:") || level === "none") {
          return fullText;
        }

        // On the final attempt, we fallback to Grade 'none' to ensure a result is returned
        const effectiveLevel = attempt === this.maxRetries ? "none" : level;
        const grade = this.gradeRawText(fullText, effectiveLevel);

        if (!grade.passed) {
          throw new Error(
            `Grade validation failed (score=${
              grade.score
            }): ${grade.failures.join("; ")}`,
          );
        }

        return fullText;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `Live session attempt ${attempt}/${this.maxRetries} failed: ${lastError.message}`,
        );

        // Fallback to REST on final attempt or if specifically requested via Rule 8
        if (attempt === this.maxRetries) {
          this.logger.log("Falling back to REST API for final attempt...");
          try {
            return await this.runRestSession(systemPrompt, userParts);
          } catch (restError) {
            this.logger.error(
              `REST fallback failed: ${(restError as Error).message}`,
            );
            // Throw the original Live error if REST also fails
            throw lastError;
          }
        }

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
   * Reliability Fallback: Use standard REST API instead of WebSocket Live
   */
  private async runRestSession(
    systemPrompt: string,
    userParts: Part[],
  ): Promise<string> {
    try {
      // Rule 8: Use generateContent as fallback
      const model = this.restAi.getGenerativeModel({
        model: this.modelName.replace("models/", ""),
        systemInstruction: systemPrompt,
      });

      const result = await model.generateContent({
        contents: [{ role: "user", parts: userParts as any }],
        generationConfig: {
          temperature: 0.4,
          topP: 0.85,
          maxOutputTokens: 1200,
        },
      });

      const response = await result.response;
      const text = response.text();

      if (!text) {
        throw new Error("REST API returned empty response");
      }

      return text;
    } catch (error) {
      this.logger.error("REST session failed", (error as Error).message);
      throw error;
    }
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
            responseModalities: [Modality.TEXT],
            systemInstruction: {
              parts: [{ text: systemPrompt }],
            },
            temperature: 0.4,
            topP: 0.85,
            maxOutputTokens: 1200,
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
              }
            },

            onerror: (err) => {
              this.logger.error("Gemini Live session error", err.message);
              finish(new Error(`Gemini Live error: ${err.message}`));
            },

            onclose: (event) => {
              this.logger.debug(
                `Gemini Live session closed (turnCompleted=${turnCompleted}, chars=${fullText.length}, reason=${event.reason})`,
              );
              if (!turnCompleted && !settled) {
                finish(
                  new Error(
                    `Gemini Live session closed prematurely: ${
                      event.reason || "Unknown reason"
                    }`,
                  ),
                );
              }
            },
          },
        })
        .then(async (s) => {
          if (settled) return;
          session = s;

          this.logger.debug("Sending content to Gemini Live session...");

          session.sendClientContent({
            turns: [{ role: "user", parts: userParts }],
          });

          // Rule 5: Turn Completion Control loop
          try {
            await new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error("Timeout waiting for response"));
              }, timeoutMs);

              const interval = setInterval(() => {
                if (turnCompleted) {
                  clearTimeout(timeout);
                  clearInterval(interval);
                  resolve();
                }

                if (settled) {
                  clearTimeout(timeout);
                  clearInterval(interval);
                  resolve(); // Already handled
                }
              }, 50);
            });

            finish();
          } catch (err) {
            finish(err as Error);
          }
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
    return `
SYSTEM: High-speed visual metadata extraction engine.
MODE: STRICT DATA ONLY.
FORBIDDEN: Conversational fillers, thinking steps, markdown, headers, commentary, explanation.
REQUIREMENT: Return ONLY the structured raw text fields below. Start immediately with IMPACT:

FORMAT:

IMPACT: <1-10>
VISUAL_WEIGHT: <1-10>

COMPOSITION:
- negative_space: left | right | center
- shot_type: CU | MS | WS
- angle: low | eye | high
- balance: symmetrical | asymmetrical
- subject_dominance: weak | moderate | strong

COLOR_PROFILE:
- temperature: warm | cold
- primary_color: color word
- secondary_colors: comma-separated
- contrast_level: low | medium | high

MOOD_DNA:
- vibe: lowercase phrase
- emotional_intensity: low | restrained | medium | strong
- rhythm: calm | dynamic | tense | still

METAPHORICAL_FIELD:
5-8 concepts (one per line, lowercase)

CINEMATIC_NOTES:
3-5 concise descriptive sentences.
`;
  }

  private getBatchAnalysisPrompt(): string {
    return `
SYSTEM: Batch visual metadata extraction engine.
MODE: STRICT DATA ONLY.
FORBIDDEN: Conversational fillers, headers, markdown, commentary.
PROCESS: Repeat the format for REACH IMAGE. Do not merge.

For EACH image:

IMAGE_ID: <id>

IMPACT: <1-10>
VISUAL_WEIGHT: <1-10>

COMPOSITION:
- negative_space: left | right | center
- shot_type: CU | MS | WS
- angle: low | eye | high
- balance: symmetrical | asymmetrical
- subject_dominance: weak | moderate | strong

COLOR_PROFILE:
- temperature: warm | cold
- primary_color: color word
- secondary_colors: comma-separated
- contrast_level: low | medium | high

MOOD_DNA:
- vibe: lowercase phrase
- emotional_intensity: low | restrained | medium | strong
- rhythm: calm | dynamic | tense | still

METAPHORICAL_FIELD:
5-8 concepts (one per line)

CINEMATIC_NOTES:
3-5 concise sentences.
`;
  }

  // ---------------------------------------------------------------------------
  // Validation & Parsing
  // ---------------------------------------------------------------------------

  private gradeRawText(
    content: string,
    level: GradeLevel = "none",
  ): GradeValidationResult {
    if (level === "none") {
      return { passed: true, score: 100, failures: [] };
    }

    const failures: string[] = [];
    let score = 0;

    const thresholds: Record<GradeLevel, number> = {
      none: 0,
      easy: 30, // Relaxed from 50
      medium: 75,
      hard: 85,
    };

    // 1. Required sections (30%)
    const requiredSections = [
      "IMPACT:",
      "VISUAL_WEIGHT:",
      "COMPOSITION:",
      "COLOR_PROFILE:",
      "MOOD_DNA:",
      "METAPHORICAL_FIELD:",
      "CINEMATIC_NOTES:",
    ];
    let sectionsFound = 0;
    const lowerContent = content.toLowerCase();
    for (const section of requiredSections) {
      if (lowerContent.includes(section.toLowerCase())) sectionsFound++;
      else failures.push(`Missing section: ${section}`);
    }
    score += (sectionsFound / requiredSections.length) * 30;

    // 2. Numeric Validation (10%)
    const impactMatch = content.match(/IMPACT:\s*(\d+)/);
    const impactScale = impactMatch ? Number.parseInt(impactMatch[1], 10) : 0;
    const weightMatch = content.match(/VISUAL_WEIGHT:\s*(\d+)/);
    const weightScale = weightMatch ? Number.parseInt(weightMatch[1], 10) : 0;

    if (
      impactScale >= 1 &&
      impactScale <= 10 &&
      weightScale >= 1 &&
      weightScale <= 10
    ) {
      score += 10;
    } else {
      failures.push("IMPACT or VISUAL_WEIGHT out of range (1-10)");
    }

    // 3. Enum Validation (20%)
    // Simplified regex check for presence of expected enum values
    const compositionOk =
      /negative_space:\s*(left|right|center)/i.test(content) &&
      /shot_type:\s*(CU|MS|WS)/i.test(content) &&
      /angle:\s*(low|eye|high)/i.test(content) &&
      /balance:\s*(symmetrical|asymmetrical)/i.test(content) &&
      /subject_dominance:\s*(weak|moderate|strong)/i.test(content);

    const colorOk =
      /temperature:\s*(warm|cold)/i.test(content) &&
      /contrast_level:\s*(low|medium|high)/i.test(content);

    if (compositionOk && colorOk) {
      score += 20;
    } else {
      failures.push("Composition or Color Profile enum validation failed");
    }

    // 4. Metaphor Density (20%)
    const metaphorSection =
      content.split("METAPHORICAL_FIELD:")[1]?.split("CINEMATIC_NOTES:")[0] ||
      "";
    const metaphors = metaphorSection
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.includes(":"));

    const metaphorThreshold = level === "easy" ? 2 : 5;
    if (metaphors.length >= metaphorThreshold) {
      score += 20;
    } else {
      failures.push(
        `Insufficient metaphors: found ${metaphors.length}, need at least ${metaphorThreshold}`,
      );
    }

    // 5. Cinematic Notes (20%)
    const notesSection = content.split("CINEMATIC_NOTES:")[1]?.trim() || "";
    const sentenceCount = (notesSection.match(/[.!?]/g) || []).length;
    const charCount = notesSection.length;

    const charThreshold = level === "easy" ? 50 : 150;
    const sentenceThreshold = level === "easy" ? 1 : 2;

    if (
      sentenceCount >= sentenceThreshold &&
      sentenceCount <= 8 &&
      charCount >= charThreshold
    ) {
      score += 20;
    } else {
      failures.push(
        `Cinematic notes quality failed: ${sentenceCount} sentences, ${charCount} chars (needed ${sentenceThreshold} sentences, ${charThreshold} chars)`,
      );
    }

    return {
      passed: score >= thresholds[level],
      score: Math.round(score),
      failures,
    };
  }

  private parseRawTextResponse(content: string): GeminiAnalysisResult {
    const getValue = (regex: RegExp, defaultValue = ""): string => {
      const match = content.match(regex);
      return match ? match[1].trim() : defaultValue;
    };

    const getList = (regex: RegExp): string[] => {
      const match = content.match(regex);
      return match
        ? match[1]
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    };

    const impact = Number.parseInt(getValue(/IMPACT:\s*(\d+)/), 10) || 5;
    const weight = Number.parseInt(getValue(/VISUAL_WEIGHT:\s*(\d+)/), 10) || 5;

    // Composition enums
    const negSpace = getValue(
      /negative_space:\s*(left|right|center)/i,
      "center",
    ) as any;
    const shotType = getValue(/shot_type:\s*(CU|MS|WS)/i, "MS") as any;
    const angle = getValue(/angle:\s*(low|eye|high)/i, "eye") as any;
    const balance = getValue(
      /balance:\s*(symmetrical|asymmetrical)/i,
      "asymmetrical",
    ) as any;
    const dominance = getValue(
      /subject_dominance:\s*(weak|moderate|strong)/i,
      "moderate",
    ) as any;

    // Color profile
    const temp = getValue(/temperature:\s*(warm|cold)/i, "warm") as any;
    const primaryColor = getValue(/primary_color:\s*(.*)/i, "neutral");
    const secondaryColors = getList(/secondary_colors:\s*(.*)/i);
    const contrast = getValue(
      /contrast_level:\s*(low|medium|high)/i,
      "medium",
    ) as any;

    // Mood DNA
    const vibe = getValue(/vibe:\s*(.*)/i, "cinematic");
    const intensity = getValue(/emotional_intensity:\s*(.*)/i, "medium");
    const rhythm = getValue(/rhythm:\s*(.*)/i, "calm");

    // Metaphors
    const metaphorSection =
      content.split("METAPHORICAL_FIELD:")[1]?.split("CINEMATIC_NOTES:")[0] ||
      "";
    const metaphors = metaphorSection
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.includes(":"));

    // Cinematic notes
    const notes = content.split("CINEMATIC_NOTES:")[1]?.trim() || "";

    return {
      impact_score: impact,
      visual_weight: weight,
      composition: {
        negative_space: negSpace,
        shot_type: shotType,
        angle: angle,
        balance: balance,
        subject_dominance: dominance,
      },
      color_profile: {
        temperature: temp,
        primary_color: primaryColor,
        secondary_colors: secondaryColors,
        contrast_level: contrast,
      },
      mood_dna: {
        temp: temp as "warm" | "cold",
        primary_color: primaryColor,
        vibe,
        emotional_intensity: intensity,
        rhythm,
      },
      metaphorical_tags: metaphors,
      cinematic_notes: notes,
    };
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
      // First try parsing as raw text (our new primary format)
      if (content.includes("IMPACT:") && content.includes("COMPOSITION:")) {
        const parsed = this.parseRawTextResponse(content);
        return { result: parsed, rawResponse: content };
      }

      // Legacy/Fallback: try JSON extraction if it doesn't look like raw text
      const jsonStr = this.extractJson(content);
      const parsed = JSON.parse(jsonStr);
      return { result: normalizeGeminiResult(parsed), rawResponse: content };
    } catch (error) {
      void error;
      // this.logger.error(
      //   "Failed to parse Gemini response",
      //   (error as Error).message,
      // );
      // Fallback: return a safe default object to avoid crashing
      this.logger.warn(`Raw content was: ${content}`);
      return { result: normalizeGeminiResult({}), rawResponse: content };
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: Parsing untyped Gemini response
  private parseBatchResponse(content: string): any[] {
    try {
      // Try Raw Text first
      if (content.includes("IMAGE_ID:")) {
        const segments = content.split(/IMAGE_ID:\s*/).filter(Boolean);
        return segments.map((segment) => {
          const lines = segment.split("\n");
          const id = lines[0].trim();
          const remainder = lines.slice(1).join("\n");
          const result = this.parseRawTextResponse(remainder);
          return { id, ...result };
        });
      }

      // Legacy fallback
      const jsonStr = this.extractJson(content);
      const parsed = JSON.parse(jsonStr);

      if (Array.isArray(parsed)) return parsed;
      if (parsed.results && Array.isArray(parsed.results))
        return parsed.results;
      if (parsed.images && Array.isArray(parsed.images)) return parsed.images;

      return [parsed];
    } catch (error) {
      void error;
      this.logger.warn(
        `Failed to parse batch Gemini response. Raw content was: ${content}`,
      );
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

    // 3. Fallback: clean typical markdown markers if present and try parsing whatever's left
    const clean = s
      .replace(/^```json\n?/, "")
      .replace(/^```\n?/, "")
      .replace(/\n?```$/, "")
      .trim();

    return clean;
  }

  // normalizeResult removed — use shared normalizeGeminiResult() from pipeline-types

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
