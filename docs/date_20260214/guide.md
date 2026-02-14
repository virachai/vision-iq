# Vision-IQ Alignment Module Guide

## 📖 Concept Overview

The **Alignment Module** is the brain of Vision-IQ. It translates abstract human narratives into concrete, searchable visual assets.

### Key Terms

1. **Scene Intent**: The "soul" of a visual moment. What is happening? What is the mood?
   - _Example_: "A feeling of isolation in a crowded city."
2. **Visual Description**: A specific, camera-ready prompt derived from the intent.
   - _Example_: "Wide shot, rainy Tokyo street at night, neon reflections, one figure standing still with an umbrella, cinematic lighting."
3. **Aligned Image**: A real image (from Pexels) that matches a Visual Description.
4. **Visual Intent Analysis**: A deep cinematic analysis of an image across 7 dimensions (Core Intent, Spatial Strategy, etc.), used to guide creative production.

---

## 🎨 Visual Intent Analysis Dimensions

Every analyzed image now includes a structured `VisualIntentAnalysis` record with:

- **1. Core Intent**: The narrative soul and emotional goal of the shot.
- **2. Spatial Strategy**: Compositional choices (Shot Type, Negative Space, Balance).
- **3. Subject Treatment**: How characters are framed and treated (Dominance, Identity, Eye Contact).
- **4. Color Psychology**: Explicit color palettes and their emotional impact.
- **5. Emotional Architecture**: The "vibe" and rhythm (Still vs. Chaotic).
- **6. Metaphorical Layer**: Symbolism and deeper meanings (e.g., "Clothes = Burden").
- **7. Cinematic Leverage**: Technical points for production (Angle, Lighting, Implied Sound).

This data is automatically generated in the background as images are ingested into the library.

---

## 🛠️ How to Use

### 1. Generating Scenes (API)

**Endpoint**: `POST /alignment/process`

**Payload**:

```json
{
  "narrative": "The hero walks into the dark room, realizing they are not alone.",
  "auto_match": true
}
```

- **narrative**: The story text you want to visualize.
- **auto_match**: If `true`, the system will immediately search Pexels for matching images.

### 2. Reviewing Results

The API returns a structured object:

```json
{
  "project_id": "...",
  "scenes": [
    {
      "intent": "Suspenseful entry",
      "descriptions": [
        {
          "prompt": "Dark room silhouette...",
          "images": [ ... ]
        }
      ]
    }
  ]
}
```

### 3. Refining Matches

If the auto-matched images aren't perfect:

1. Copy the `VisualDescription` text.
2. Manually search or tweak the prompt.
3. Update the description in the system to trigger a fresh search (future feature).

---

## 🧠 Best Practices

- **Narrative Input**: Be descriptive but concise. 2-3 sentences often yield better individual scenes than a whole novel chapter at once.
- **Style Consistency**: The system uses DeepSeek to maintain a "Mood DNA". If you want a specific style (e.g., "Cyberpunk"), mention it in the narrative input explicitly if it's not implied.

---

## 🔮 Future Capabilities

- **Feedback Loop**: Marking an image as "Bad" will train the ranking algorithm.
- **Video Generation**: Aligned images will eventually serve as keyframes for video generation.
