// import {
//   GoogleGenAI,
//   LiveServerMessage,
//   Modality,
//   Session,
// } from "@google/genai";
// import { Injectable, Logger } from "@nestjs/common";

// interface GeminiAnalysisResult {
//   impact_score: number;
//   visual_weight: number;
//   composition: {
//     negative_space: "left" | "right" | "center";
//     shot_type: "CU" | "MS" | "WS";
//     angle: "low" | "eye" | "high";
//   };
//   mood_dna: {
//     temp: "warm" | "cold";
//     primary_color: string;
//     vibe: string;
//   };
//   metaphorical_tags: string[];
// }

// @Injectable()
// export class GeminiAnalysisService {
//   private readonly logger = new Logger(GeminiAnalysisService.name);
//   private readonly ai: GoogleGenAI;
//   private readonly modelName = "models/gemini-2.5-flash";

//   constructor() {
//     const apiKey = process.env.GEMINI_API_KEY || "";
//     this.ai = new GoogleGenAI({ apiKey });

//     if (!apiKey) {
//       this.logger.error("GEMINI_API_KEY not configured.");
//     }
//   }

//   async analyzeImage(imageUrl: string): Promise<GeminiAnalysisResult> {
//     let session: Session | undefined;
//     const responseQueue: LiveServerMessage[] = [];

//     try {
//       const { imageBase64, imageMime } = await this.fetchImageData(imageUrl);

//       let fullText = "";
//       let turnCompleted = false;

//       session = await this.ai.live.connect({
//         model: this.modelName,
//         config: {
//           responseModalities: [Modality.TEXT],
//           systemInstruction: {
//             parts: [{ text: this.getAnalysisPrompt() }],
//           },
//         },
//         callbacks: {
//           onopen: () => {
//             this.logger.debug("Gemini Live session opened");
//           },

//           onmessage: (message: LiveServerMessage) => {
//             responseQueue.push(message);

//             const content = message.serverContent;

//             const parts = content?.modelTurn?.parts;
//             if (parts) {
//               for (const part of parts) {
//                 if (part.text) {
//                   fullText += part.text;
//                 }
//               }
//             }

//             if (content?.turnComplete) {
//               turnCompleted = true;
//             }
//           },

//           onerror: (err) => {
//             this.logger.error("Gemini Live error", err.message);
//           },

//           onclose: () => {
//             this.logger.debug("Gemini Live session closed");
//           },
//         },
//       });

//       session.sendClientContent({
//         turns: [
//           {
//             role: "user",
//             parts: [
//               {
//                 text: "Analyze this image and return only the JSON.",
//               },
//               {
//                 inlineData: {
//                   mimeType: imageMime,
//                   data: imageBase64,
//                 },
//               },
//             ],
//           },
//         ],
//       });

//       await this.waitForTurnCompletion(() => turnCompleted, 15000);

//       session.close();

//       return this.parseGeminiResponse(fullText);
//     } catch (error) {
//       this.logger.error("Image analysis failed", (error as Error).message);

//       if (session) {
//         try {
//           session.close();
//         } catch {}
//       }

//       throw new Error(
//         `Gemini Live analysis failed: ${(error as Error).message}`,
//       );
//     }
//   }

//   private waitForTurnCompletion(
//     checkFn: () => boolean,
//     timeoutMs: number,
//   ): Promise<void> {
//     return new Promise((resolve, reject) => {
//       const timeout = setTimeout(() => {
//         reject(new Error("Gemini Live timeout"));
//       }, timeoutMs);

//       const interval = setInterval(() => {
//         if (checkFn()) {
//           clearTimeout(timeout);
//           clearInterval(interval);
//           resolve();
//         }
//       }, 50);
//     });
//   }

//   private getAnalysisPrompt(): string {
//     return `You are a professional film cinematographer analyzing visual composition and mood.

// Analyze this image and extract the following in JSON format:

// 1. impact_score (1-10)
// 2. visual_weight (1-10)
// 3. composition:
//    - negative_space: "left" | "right" | "center"
//    - shot_type: "CU" | "MS" | "WS"
//    - angle: "low" | "eye" | "high"
// 4. mood_dna:
//    - temp: "warm" | "cold"
//    - primary_color: "#RRGGBB"
//    - vibe: string
// 5. metaphorical_tags: array of 5-10 abstract concepts

// Return ONLY valid JSON. No markdown. No explanation.`;
//   }

//   private async fetchImageData(
//     imageUrl: string,
//   ): Promise<{ imageBase64: string; imageMime: string }> {
//     const res = await fetch(imageUrl);
//     if (!res.ok) {
//       throw new Error(`Failed to fetch image: ${res.statusText}`);
//     }

//     const buffer = Buffer.from(await res.arrayBuffer());
//     const imageBase64 = buffer.toString("base64");
//     const imageMime = res.headers.get("content-type") || "image/jpeg";

//     return { imageBase64, imageMime };
//   }

//   private parseGeminiResponse(content: string): GeminiAnalysisResult {
//     try {
//       let jsonStr = content.trim();

//       if (jsonStr.startsWith("```")) {
//         jsonStr = jsonStr
//           .replace(/^```json\n?/, "")
//           .replace(/^```\n?/, "")
//           .replace(/\n?```$/, "");
//       }

//       const parsed = JSON.parse(jsonStr);

//       return {
//         impact_score: Math.min(10, Math.max(1, parsed.impact_score || 5)),
//         visual_weight: Math.min(10, Math.max(1, parsed.visual_weight || 5)),
//         composition: {
//           negative_space: ["left", "right", "center"].includes(
//             parsed.composition?.negative_space,
//           )
//             ? parsed.composition.negative_space
//             : "center",
//           shot_type: ["CU", "MS", "WS"].includes(parsed.composition?.shot_type)
//             ? parsed.composition.shot_type
//             : "MS",
//           angle: ["low", "eye", "high"].includes(parsed.composition?.angle)
//             ? parsed.composition.angle
//             : "eye",
//         },
//         mood_dna: {
//           temp: parsed.mood_dna?.temp === "cold" ? "cold" : "warm",
//           primary_color: parsed.mood_dna?.primary_color || "#300880",
//           vibe: parsed.mood_dna?.vibe || "neutral",
//         },
//         metaphorical_tags: Array.isArray(parsed.metaphorical_tags)
//           ? parsed.metaphorical_tags.slice(0, 15)
//           : [],
//       };
//     } catch (error) {
//       this.logger.error(
//         "Failed to parse Gemini response",
//         (error as Error).message,
//       );
//       throw new Error(`Invalid JSON from Gemini: ${(error as Error).message}`);
//     }
//   }
// }
