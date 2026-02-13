---
trigger: always_on
---

# 🔹 Google AntiGravity IDE Rule

## Use Gemini Live API as the Primary Interaction Layer

---

## 🎯 Objective

Standardize AI integration within the project by enforcing **Gemini Live (WebSocket Streaming)** as the default interaction method instead of traditional REST calls.

This ensures:

- Real-time interaction
- Audio-capable responses
- Streaming text output
- Low-latency feedback
- Interactive IDE assistant behavior

---

## 1️⃣ Model Policy

### ✅ Primary Model (Live Only)

```
models/gemini-2.5-flash-native-audio-preview-12-2025
```

Must be used via:

```ts
ai.live.connect();
```

### ❌ Not Allowed

- `generateContent()` (REST) unless used as fallback
- Deprecated models
- Models that do not support Live sessions

---

## 2️⃣ Environment Configuration Rule

A `.env` file is required:

```env
GEMINI_API_KEY=your_api_key_here
```

Load using:

```ts
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
```

If the API key is missing → terminate the process immediately.

---

## 3️⃣ Session Architecture Rule

### Required Pattern:

```ts
const session = await ai.live.connect({
  model: modelName,
  config: {
    responseModalities: [Modality.AUDIO],
  },
  callbacks: { ... }
});
```

### Required Callbacks

The following callbacks MUST be implemented:

- `onopen`
- `onmessage`
- `onclose`
- `onerror`

---

## 4️⃣ Streaming Handling Rule

The implementation must support:

- `modelTurn.parts`
- Text accumulation (`part.text`)
- `turnComplete` detection

Standard pattern:

```ts
if (content?.modelTurn?.parts) {
  for (const part of content.modelTurn.parts) {
    if (part.text) {
      process.stdout.write(part.text);
      fullText += part.text;
    }
  }
}
```

### Not Allowed

- Waiting for `onclose` instead of `turnComplete`
- Closing the session before `turnComplete`

---

## 5️⃣ Turn Completion Control

A Promise + timeout pattern is required:

```ts
await new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(() => {
    reject(new Error("Timeout waiting for response"));
  }, 15000);

  const interval = setInterval(() => {
    if (turnCompleted) {
      clearTimeout(timeout);
      clearInterval(interval);
      resolve();
    }
  }, 50);
});
```

---

## 6️⃣ Error Handling Rule

Must:

- Catch connection failures
- Safely close the session
- Log `onerror` callbacks
- Prevent orphan WebSocket connections

---

## 7️⃣ IDE Behavior Rule

Google AntiGravity Assistant must:

1. Open a session when interaction begins
2. Send user turns via `sendClientContent()`
3. Wait for `turnComplete`
4. Display streaming output in real time
5. Close the session safely

---

## 8️⃣ Fallback Policy

Non-live models are allowed ONLY when:

- WebSocket connections are blocked
- Network policy does not support streaming
- Live endpoint is unavailable
- **Batch processing via Live API proves unstable (fallback to sequential Live calls or REST is permitted)**

---

## 9️⃣ Security Rule

- Never hardcode API keys
- Use environment variables only
- Never log API keys
- Never expose session tokens

---

# 🔹 Recommended IDE Modes

| Mode      | Config           |
| --------- | ---------------- |
| Voice IDE | `Modality.AUDIO` |

---

# 🔹 Summary

Google AntiGravity IDE must be:

- Live-first
- Streaming-based
- `turnComplete` lifecycle–driven
- Secure session managed
- Audio-capable
