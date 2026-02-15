// import {
//   GoogleGenAI,
//   LiveServerMessage,
//   MediaResolution,
//   Modality,
//   // Session,
// } from '@google/genai';
// import { writeFile } from 'fs/promises';

// /* ----------------------- Message Queue ----------------------- */

// class MessageQueue {
//   private queue: LiveServerMessage[] = [];
//   private resolvers: ((msg: LiveServerMessage) => void)[] = [];

//   push(msg: LiveServerMessage) {
//     const resolve = this.resolvers.shift();
//     if (resolve) {
//       resolve(msg);
//     } else {
//       this.queue.push(msg);
//     }
//   }

//   async next(): Promise<LiveServerMessage> {
//     if (this.queue.length) return this.queue.shift()!;
//     return new Promise((resolve) => this.resolvers.push(resolve));
//   }
// }

// const messageQueue = new MessageQueue();

// /* ----------------------- Audio Handling ----------------------- */

// const audioChunks: Buffer[] = [];
// let audioMimeType = '';

// function handleModelTurn(message: LiveServerMessage) {
//   const part = message.serverContent?.modelTurn?.parts?.[0];
//   if (!part) return;

//   if (part.text) {
//     console.log(part.text);
//   }

//   if (part.fileData) {
//     console.log(`File URI: ${part.fileData.fileUri}`);
//   }

//   if (part.inlineData) {
//     audioMimeType ||= part.inlineData.mimeType ?? '';
//     audioChunks.push(Buffer.from(part.inlineData.data ?? '', 'base64'));
//   }
// }

// async function finalizeAudio() {
//   if (!audioChunks.length) return;

//   const options = parseMimeType(audioMimeType);
//   const pcmData = Buffer.concat(audioChunks);
//   const wav = Buffer.concat([
//     createWavHeader(pcmData.length, options),
//     pcmData,
//   ]);

//   await writeFile('audio.wav', wav);
//   console.log('🎧 audio.wav written');
// }

// /* ----------------------- WAV Utils ----------------------- */

// interface WavConversionOptions {
//   numChannels: number;
//   sampleRate: number;
//   bitsPerSample: number;
// }

// function parseMimeType(mimeType: string): WavConversionOptions {
//   const [, ...params] = mimeType.split(';').map((s) => s.trim());

//   const options: WavConversionOptions = {
//     numChannels: 1,
//     sampleRate: 24000,
//     bitsPerSample: 16,
//   };

//   for (const param of params) {
//     const [key, value] = param.split('=');
//     if (key === 'rate') options.sampleRate = Number(value);
//   }

//   return options;
// }

// function createWavHeader(dataLength: number, o: WavConversionOptions) {
//   const buffer = Buffer.alloc(44);
//   const byteRate = (o.sampleRate * o.numChannels * o.bitsPerSample) / 8;
//   const blockAlign = (o.numChannels * o.bitsPerSample) / 8;

//   buffer.write('RIFF', 0);
//   buffer.writeUInt32LE(36 + dataLength, 4);
//   buffer.write('WAVE', 8);
//   buffer.write('fmt ', 12);
//   buffer.writeUInt32LE(16, 16);
//   buffer.writeUInt16LE(1, 20);
//   buffer.writeUInt16LE(o.numChannels, 22);
//   buffer.writeUInt32LE(o.sampleRate, 24);
//   buffer.writeUInt32LE(byteRate, 28);
//   buffer.writeUInt16LE(blockAlign, 32);
//   buffer.writeUInt16LE(o.bitsPerSample, 34);
//   buffer.write('data', 36);
//   buffer.writeUInt32LE(dataLength, 40);

//   return buffer;
// }

// /* ----------------------- Turn Handling ----------------------- */

// async function handleTurn() {
//   while (true) {
//     const msg = await messageQueue.next();
//     handleModelTurn(msg);

//     if (msg.serverContent?.turnComplete) {
//       await finalizeAudio();
//       break;
//     }
//   }
// }

// /* ----------------------- Main ----------------------- */

// async function main() {
//   const ai = new GoogleGenAI({
//     apiKey: process.env.GEMINI_API_KEY,
//   });

//   const session = await ai.live.connect({
//     model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
//     config: {
//       responseModalities: [Modality.AUDIO],
//       mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
//       speechConfig: {
//         voiceConfig: {
//           prebuiltVoiceConfig: { voiceName: 'Zephyr' },
//         },
//       },
//     },
//     callbacks: {
//       onmessage: (msg) => messageQueue.push(msg),
//       onopen: () => console.log('Connected'),
//       onclose: (e) => console.log('Closed:', e.reason),
//       onerror: (e) => console.error(e.message),
//     },
//   });

//   session.sendClientContent({
//     turns: ['When you have a dream you’ve got to grab it and never let go'],
//   });

//   await handleTurn();
//   session.close();
// }

// void main();
