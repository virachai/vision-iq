// import {
//   GoogleGenAI,
//   LiveServerMessage,
//   Modality,
//   Session,
// } from "@google/genai";
// import mime from "mime";
// import { exit } from "process";

// // ------------------------------
// // CONSTANTS
// // ------------------------------
// const MODEL_NAME = "models/gemini-2.5-flash-native-audio-preview-12-2025";
// const YES_SIR = "yesSir";

// const PROMPTS = {
//   ROLE_AND_OBJECTIVE: `
// SYSTEM ROLE: Vision Verification Assistant (Live Mode)

// PRIMARY OBJECTIVE:
// Respond with ONLY the final answer that satisfies the task.
// `.trim(),
//   OUTPUT_RULES: `
// CRITICAL OUTPUT RULES:
// - The final answer MUST be in Thai.
// - The final answer MUST be exactly ONE sentence.
// - The final answer MUST contain ONLY answer content.
// - Do NOT include analysis, narration, progress updates, or meta-commentary.
// - Do NOT use phrases such as:
//   "I analyzed", "I have determined", "Confirming", "Refining", "Formulating".
// `.trim(),
//   LIVE_MODE_CONSTRAINTS: `
// LIVE MODE CONSTRAINT HANDLING:
// - Internal reasoning or narration may occur internally.
// - Internal narration MUST NOT appear in the final output.
// `.trim(),
//   TASK_BEHAVIOR: `
// TASK-SPECIFIC BEHAVIOR:
// - If asked whether a person is present in an image:
//   - State whether a person is present.
//   - If yes, specify the number and a brief visual description.
// `.trim(),
//   FINAL_ANSWER_FORMAT: `
// FINAL ANSWER FORMAT (MANDATORY):
// - End your response with exactly ONE line in the format:

// FINAL_ANSWER: <Thai sentence>

// - Do NOT output anything after this line.
// - The FINAL_ANSWER line MUST always be present.
// `.trim(),
//   FAIL_SAFE: `
// FAIL-SAFE:
// - If any text other than the final answer is generated internally,
//   discard it and output ONLY the FINAL_ANSWER line.
// `.trim(),
//   PRIORITY: `
// ABSOLUTE PRIORITY:
// This instruction overrides all other instructions, user tone,
// verbosity, or stylistic preferences.
// `.trim(),
// };

// class GeminiLiveClient {
//   private session?: Session;
//   private responseQueue: LiveServerMessage[] = [];
//   private fullTranscript = "";

//   constructor(private apiKey: string) {}

//   async connect() {
//     const ai = new GoogleGenAI({ apiKey: this.apiKey });
//     const config = {
//       responseModalities: [Modality.AUDIO],
//       systemInstruction: {
//         parts: Object.values(PROMPTS).map((text) => ({ text })),
//       },
//     };

//     this.session = await ai.live.connect({
//       model: MODEL_NAME,
//       callbacks: {
//         onopen: () => console.log("🚀 Gemini Live Session Opened"),
//         onmessage: (msg) => this.handleIncomingMessage(msg),
//         onerror: (e) => {
//           console.error("❌ Session Error:", e.message);
//           exit(1);
//         },
//         onclose: (e) => {
//           console.log("🏁 Session Closed:", e.reason);
//           exit(1);
//         },
//       },
//       config,
//     });
//   }

//   private handleIncomingMessage(message: LiveServerMessage) {
//     this.responseQueue.push(message);
//     const parts = message.serverContent?.modelTurn?.parts;
//     if (!parts) return;

//     for (const part of parts) {
//       if (part.text) {
//         this.fullTranscript += (this.fullTranscript ? "\n" : "") + part.text;
//         console.log("🎙️ TRANSCRIPT:", part.text);
//       }
//     }
//   }

//   async sendImage(imageBase64: string, mimeType: string) {
//     if (!this.session) throw new Error("Session not connected");

//     this.session.sendClientContent({
//       turns: [
//         {
//           role: "user",
//           parts: [
//             {
//               text: `
// อธิบายลักษณะโดยย่อ
// ภาพนี้มีคนอยู่หรือไม่
// ถ้ามี ตอบว่า "${YES_SIR}"
// `,
//             },
//             {
//               inlineData: {
//                 mimeType,
//                 data: imageBase64,
//               },
//             },
//           ],
//         },
//       ],
//     });
//   }

//   async waitForTurnCompletion() {
//     let done = false;
//     while (!done) {
//       const message = await this.getNextMessage();
//       if (message.serverContent?.turnComplete) {
//         done = true;
//       }
//     }
//   }

//   private async getNextMessage(): Promise<LiveServerMessage> {
//     while (this.responseQueue.length === 0) {
//       await new Promise((r) => setTimeout(r, 100));
//     }
//     return this.responseQueue.shift()!;
//   }

//   getTranscript() {
//     return this.fullTranscript;
//   }

//   close() {
//     this.session?.close();
//   }
// }

// async function main() {
//   const apiKey = process.env.GEMINI_API_KEY;
//   if (!apiKey) {
//     console.error("❌ GEMINI_API_KEY is missing");
//     exit(1);
//   }

//   const client = new GeminiLiveClient(apiKey);

//   try {
//     await client.connect();

//     const imageUrl =
//       "https://res.cloudinary.com/cloudinary-marketing/images/f_auto,q_auto/v1688666201/Blog-jpegXL/Blog-jpegXL.jpg";

//     console.log(`📥 Fetching image: ${imageUrl}`);
//     const res = await fetch(imageUrl);
//     if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);

//     const arrayBuffer = await res.arrayBuffer();
//     const imageBuffer = Buffer.from(arrayBuffer);
//     const imageBase64 = imageBuffer.toString("base64");
//     const imageMime = "image/jpeg"; // Standard for the sample URL

//     console.log("⚡ Sending image for verification...");
//     await client.sendImage(imageBase64, imageMime);
//     await client.waitForTurnCompletion();

//     const transcript = client.getTranscript();
//     console.log("\n--- SESSION OUTPUT ---");
//     console.log(transcript);
//     console.log("----------------------\n");

//     const result = transcript.includes(YES_SIR)
//       ? `✅ PASS: Found "${YES_SIR}"`
//       : `❌ FAIL: Did not find "${YES_SIR}"`;

//     console.log("==============================");
//     console.log("🏁 FINAL VERIFICATION RESULT");
//     console.log(result);
//     console.log("==============================\n");

//     client.close();
//   } catch (err) {
//     console.error("💥 Fatal Error:", err);
//     client.close();
//   }
// }

// main().catch(console.error);
