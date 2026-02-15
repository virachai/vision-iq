import {
  GoogleGenAI,
  LiveServerMessage,
  MediaResolution,
  Modality,
  Session,
} from "@google/genai";
import { writeFile } from "fs";

// ts-node -r dotenv/config ./src/scripts/verify-ai-live.ts

const responseQueue: LiveServerMessage[] = [];
let session: Session | undefined = undefined;

async function handleTurn(): Promise<LiveServerMessage[]> {
  const turn: LiveServerMessage[] = [];
  let done = false;
  while (!done) {
    const message = await waitMessage();
    turn.push(message);
    if (message.serverContent && message.serverContent.turnComplete) {
      done = true;
    }
  }
  return turn;
}

async function waitMessage(): Promise<LiveServerMessage> {
  let done = false;
  let message: LiveServerMessage | undefined = undefined;
  while (!done) {
    message = responseQueue.shift();
    if (message) {
      handleModelTurn(message);
      done = true;
    } else {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  return message!;
}

const audioParts: string[] = [];
function handleModelTurn(message: LiveServerMessage) {
  if (message.serverContent?.modelTurn?.parts) {
    const part = message.serverContent?.modelTurn?.parts?.[0];

    if (part?.fileData) {
      console.log(`File: ${part?.fileData.fileUri}`);
    }

    if (part?.inlineData) {
      const fileName = "audio.wav";
      const inlineData = part?.inlineData;

      audioParts.push(inlineData?.data ?? "");

      const buffer = convertToWav(audioParts, inlineData.mimeType ?? "");
      saveBinaryFile(fileName, buffer);
    }

    if (part?.text) {
      console.log(part?.text);
    }
  }
}

function saveBinaryFile(fileName: string, content: Buffer) {
  // exit();
  writeFile(fileName, content, "utf8", (err) => {
    if (err) {
      console.error(`Error writing file ${fileName}:`, err);
      return;
    }
    console.log(`Appending stream content to file ${fileName}.`);
  });
}

interface WavConversionOptions {
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
}

function convertToWav(rawData: string[], mimeType: string) {
  const options = parseMimeType(mimeType);
  const dataLength = rawData.reduce((a, b) => a + b.length, 0);
  const wavHeader = createWavHeader(dataLength, options);
  const buffer = Buffer.concat(
    rawData.map((data) => Buffer.from(data, "base64")),
  );

  return Buffer.concat([wavHeader, buffer]);
}

function parseMimeType(mimeType: string) {
  const [fileType, ...params] = mimeType.split(";").map((s) => s.trim());
  const [, format] = fileType.split("/");

  const options: Partial<WavConversionOptions> = {
    numChannels: 1,
    bitsPerSample: 16,
  };

  if (format && format.startsWith("L")) {
    const bits = parseInt(format.slice(1), 10);
    if (!isNaN(bits)) {
      options.bitsPerSample = bits;
    }
  }

  for (const param of params) {
    const [key, value] = param.split("=").map((s) => s.trim());
    if (key === "rate") {
      options.sampleRate = parseInt(value, 10);
    }
  }

  return options as WavConversionOptions;
}

function createWavHeader(dataLength: number, options: WavConversionOptions) {
  const { numChannels, sampleRate, bitsPerSample } = options;

  // http://soundfile.sapp.org/doc/WaveFormat

  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const buffer = Buffer.alloc(44);

  buffer.write("RIFF", 0); // ChunkID
  buffer.writeUInt32LE(36 + dataLength, 4); // ChunkSize
  buffer.write("WAVE", 8); // Format
  buffer.write("fmt ", 12); // Subchunk1ID
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(numChannels, 22); // NumChannels
  buffer.writeUInt32LE(sampleRate, 24); // SampleRate
  buffer.writeUInt32LE(byteRate, 28); // ByteRate
  buffer.writeUInt16LE(blockAlign, 32); // BlockAlign
  buffer.writeUInt16LE(bitsPerSample, 34); // BitsPerSample
  buffer.write("data", 36); // Subchunk2ID
  buffer.writeUInt32LE(dataLength, 40); // Subchunk2Size

  return buffer;
}

async function main() {
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    apiVersion: "v1alpha",
  });

  const model = "models/gemini-2.5-flash-native-audio-preview-12-2025";

  const PROMPT_TEXT_v2 = [
    //     {
    //       text: `
    // Language:
    // Thai only.
    // Do not use or mix any other languages.
    // Use simple, everyday Thai words that are easy for AI to pronounce.
    // Avoid difficult, formal, poetic, or complex vocabulary.
    // `,
    //     },
    {
      text: `
Language:
Primary language is Thai.
Avoid mixing languages unless necessary for pronunciation clarity.
Use simple, everyday Thai words that are easy for AI to pronounce.
Avoid difficult, formal, poetic, or complex Thai vocabulary.
If a Thai word is hard to pronounce or sounds unnatural in AI speech,
replace it with a simple English word that is commonly understood.
Prioritize smooth, natural speech over strict language purity.
`,
    },
    {
      text: `
Role & Identity:
You are a world-class content creator with a massive global following.
You act as a trusted influencer life coach.
Your delivery feels real, grounded, and experience-based — never preachy, never performative.
`,
    },
    {
      text: `
Performance Objective:
Create a 15 to 30 second short-form video for Reels / Shorts.
The performance must stop scrolling, hold attention, and feel worth sharing.
Make the viewer feel understood and emotionally lighter by the end.
`,
    },
    //     {
    //       text: `
    // Psychological Priming Phrases (Opening Lines):

    // Use short, simple English phrases at the beginning of the video
    // to gently guide the listener into a receptive, safe emotional state.
    // These phrases should feel calm, personal, and non-authoritative.

    // Examples (choose one only per video):
    // - "Listen to me for a moment."
    // - "Just hear me out."
    // - "Stay with me for a second."
    // - "Let me say this first."
    // - "This might be for you."
    // - "You might need this today."
    // - "I want you to hear this."

    // Psychological Principles:
    // - Lower resistance by avoiding commands or pressure
    // - Create a one-on-one, intimate feeling
    // - Signal safety, care, and personal relevance
    // - Make the listener feel chosen, not targeted

    // Delivery Rules:
    // - Speak softly and slowly
    // - Slight pause after the phrase before continuing
    // - Do not repeat or stack multiple phrases
    // - Do not add explanation after the phrase
    // `,
    //     },
    //     {
    //       text: `
    // คำพูดบทนำเพื่อปรับสภาพใจผู้ฟัง (Priming Phrases):

    // ใช้ประโยคสั้น ๆ ตอนต้นคลิป
    // เพื่อทำให้ผู้ฟังรู้สึกปลอดภัย เปิดใจ และพร้อมรับฟัง
    // ประโยคต้องฟังดูอ่อนโยน เป็นส่วนตัว และไม่ใช่คำสั่ง

    // ตัวอย่าง (เลือกใช้เพียง 1 ประโยคต่อคลิป):
    // - "ฟังเรานะ"
    // - "ขอพูดอะไรสั้น ๆ หน่อย"
    // - "ขอให้ฟังตรงนี้นิดหนึ่ง"
    // - "อยากให้คุณได้ยินเรื่องนี้"
    // - "บางทีอันนี้อาจเป็นของคุณ"
    // - "วันนี้คุณอาจต้องได้ยินสิ่งนี้"
    // - "ขอเวลาคุณแป๊บหนึ่ง"

    // หลักจิตวิทยาที่ใช้:
    // - ลดแรงต้านด้วยการไม่ออกคำสั่ง
    // - สร้างความรู้สึกคุยกันแบบตัวต่อตัว
    // - ทำให้ผู้ฟังรู้สึกถูกเลือก ไม่ถูกสั่ง
    // - เปิดพื้นที่ปลอดภัยทางอารมณ์ก่อนเข้าเนื้อหา

    // กติกาการพูด:
    // - พูดช้า เบา และนุ่ม
    // - เว้นจังหวะสั้น ๆ หลังพูดจบ
    // - ห้ามพูดซ้ำหรือใช้หลายประโยคติดกัน
    // - ห้ามอธิบายหรือขยายความต่อทันที
    // `,
    //     },
    {
      text: `
    Performance Structure:

    1) Scroll-Stop Hook (0 to 2 seconds)
    - One sentence only
    - Emotionally true and attention-grabbing
    - Calm, firm, confident voice
    - No explanation

    2) Emotional Lock (2 to 7 seconds)
    - Reflect an unspoken feeling
    - Warm, personal tone
    - Speak directly to the viewer

    3) Value Drop (7 to 22 seconds)
    - One core idea only
    - Reframe gently to ease emotional weight
    - Short, rhythmic sentences
    - Slow down and soften voice on key insight

    4) Soft Emotional Exit (22 to 30 seconds)
    - Declarative closing statement
    - No commands or urgency
    - Calm, reassuring tone
    `,
    },
    {
      text: `
Tone & Acting Style:
Overall tone must remain calm, warm, and emotionally grounded from start to finish.
Avoid exaggerated emotions, dramatic swings, or performance-like delivery.
Energy should be steady, not rushed, not flat.

Acting & Presence:
Minimal body movement and facial expression.
Natural, relaxed posture.
Eye-line feels present and attentive, as if listening as much as speaking.
No forced gestures or emphasis.

Voice & Delivery:
Voice is soft, clear, and sincere.
Speak slightly slower than normal conversation.
Allow gentle pauses between thoughts.
Lower volume and soften tone when delivering emotional or reflective lines.
Avoid sharp emphasis or aggressive projection.

Emotional Control:
Express empathy without sounding sad or heavy.
Do not sound excited, hyped, or overly motivational.
Confidence should feel quiet and reassuring, not dominant.

Connection with Viewer:
Speak as if sitting beside the viewer, not in front of an audience.
Create a one-on-one feeling, intimate and personal.
Every line should feel safe, human, and emotionally honest.

Language Feel:
Simple.
Natural flow, not scripted.
Fewer words, more emotional weight.
`,
    },
    {
      text: `
Pronunciation & Natural Speech:
Pronunciation does not need to perfectly match written text.
Allow soft endings, slight slurring, pauses, and breath breaks.
Speech should feel spoken, not read.
Prioritize emotional realism over perfect articulation.
`,
    },
    {
      text: `
Hard Rules:
No long introductions.
No multiple ideas in one video.
No direct advice or instructions.
No calls to like, share, or follow.
No complex or philosophical language.
`,
    },
  ];

  //   const PROMPT_TEXT_v2 = `
  // ให้พูดในบทบาท “influencer life coach” สำหรับคลิปวิดีโอสั้น
  // เน้นเขียนข้อความให้ AI อ่านออกเสียงภาษาไทยได้ถูกต้องระดับผู้ประกาศข่าวชั้นนำของไทยระดับแถวหน้าที่มีชื่อเสียง ชัดเจน และเป็นธรรมชาติ

  // บทบาทและภาพรวม:
  // - พูดเหมือนเข้าใจโลก เข้าใจคนทั่วไป
  // - พูดตรง เรียบ ง่าย ฟังแล้วรู้สึกปลอดภัย
  // - ใช้ภาษาคนธรรมดา

  // โครงสร้างคลิป (Viral Short Video):

  // 1) Hook (0 to 3 วินาทีแรก)
  // - เปิดด้วยประโยคที่ “หยุดใจคนฟัง”
  // - เป็นคำถามหรือประโยคสะกิดใจ เช่น
  //   “เคยไหม…ยิ่งพยายาม ยิ่งเหนื่อย”
  //   “บางทีปัญหาไม่ได้หนัก แค่ใจเราแบกเยอะ”
  // - น้ำเสียงชัด หนักแน่น แต่ไม่ดุ

  // 2) Foreshadowing / Intro (3 to 10 วินาที)
  // - บอกใบ้ว่าคลิปนี้จะพาใจเขาไปเจออะไร
  // - ทำให้คนรู้สึกว่า ‘ควรฟังต่อ’

  // 3) Body / Value (เนื้อหาหลัก)
  // - เล่าปัญหาชีวิตแบบมนุษย์ธรรมดา
  // - เชื่อมกับมุมมองเรียบง่ายที่ฟังแล้วใจเบา
  // - ใช้ตัวอย่างใกล้ตัว ไม่ยกหลักธรรมยาก
  // - ประโยคสั้น ชัด มีจังหวะหยุด
  // - ตอนประโยข้อคิด ให้ “กดเสียงเบาลง” เล็กน้อย
  //   เพื่อให้คนฟังรู้สึกสงบและซึมเข้าใจ

  // 4) Closing / Soft CTA (ตอนจบ)
  // - ไม่สั่ง ไม่ขอ ไม่เร่ง
  // - จบด้วยประโยคที่ปล่อยใจ ไม่ค้างคา

  // TONE & DELIVERY:
  // - เปิดคลิปแรงพอให้หยุดฟังใน 3 วินาที
  // - น้ำเสียงอบอุ่น เมตตา จริงใจ
  // - แทงใจเบา ๆ แต่ไม่ทำให้รู้สึกผิด
  // - ฟังแล้วเหมือนมีใครนั่งอยู่ข้าง ๆ
  // `;

  //   const MONK_PROMPT_TEXT_v1 = `
  // ให้พูดในบทบาท “พระนักเทศน์ร่วมสมัย”

  // กติกาการพูด:
  // - ตรงได้ แต่ไม่แรง ไม่ตำหนิ ไม่สั่งสอน
  // - เริ่มด้วยประโยคที่ดึงความสนใจ
  // - ไม่ใช้ศัพท์ธรรมะยาก

  // TONE & DELIVERY:
  // - เปิดคลิปแรง หยุดคนฟังใน 3 วินาทีแรก
  // - กดเสียงเบา ๆ ตอนประโยคธรรมะ
  // - น้ำเสียงอบอุ่น ปลอดภัย แต่แทงใจเบา ๆ
  // `;

  //   const MONK_PROMPT_TEXT_v2 = `
  // ให้พูดในบทบาทพระนักเทศน์

  // กติกาการพูด:
  // - ตรงได้ แต่ไม่แรง ไม่ตำหนิ ไม่สั่งสอน
  // - เหมือนพระเตือนด้วยรอยยิ้ม ไม่ใช่ตอกด้วยคำพูด
  // - ไม่ใช้ศัพท์ธรรมะยาก ไม่อธิบายยาว

  // TONE & DELIVERY:
  // - เปิดคลิปแรง หยุดคนฟังใน 3 วินาทีแรก
  // - กดเสียงเบา ๆ ตอนประโยคธรรมะ
  // - เว้นจังหวะหลังประโยคคม ให้คำพูดทำงาน
  // - น้ำเสียงอบอุ่น ปลอดภัย แต่แทงใจเบา ๆ

  // Use structured reasoning in the final answer.
  // Do NOT reveal internal chain-of-thought.
  // Explain ideas clearly as a monk teaching laypeople.
  // `;

  const config = {
    responseModalities: [Modality.AUDIO],
    mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          // voiceName: 'Algenib',
          voiceName: "Puck",
        },
      },
    },
    contextWindowCompression: {
      triggerTokens: "25600",
      slidingWindow: { targetTokens: "12800" },
    },
    // systemInstruction: MONK_SYSTEM_INSTRUCTION,
    systemInstruction: PROMPT_TEXT_v2,
  };

  session = await ai.live.connect({
    model,
    callbacks: {
      onopen: function () {
        console.debug("Opened");
      },
      onmessage: function (message: LiveServerMessage) {
        responseQueue.push(message);
      },
      onerror: function (e: ErrorEvent) {
        console.debug("Error:", e.message);
      },
      onclose: function (e: CloseEvent) {
        console.debug("Close:", e.reason);
      },
    },
    config,
  });

  session.sendClientContent({
    turns: [
      `Compassion is the silent language that resonates across all divides.`,
    ],
  });

  await handleTurn();

  session.close();
}
void main();
