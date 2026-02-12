# Image Alignment & Semantic Matching Service

## Architecture Overview

The Narrative-to-Video Image Alignment system consists of five integrated modules working together to match raw story narratives with a library of 1,000,000+ Pexels images:

### 1. **DeepSeek Integration Module**
- **Role**: Parse raw, conversational Gemini Live text into structured scene intents
- **Input**: Unstructured narrative text
- **Output**: Typed SceneIntent objects with `intent`, `required_impact` (1-10), and `preferred_composition`
- **File**: `deepseek-integration/deepseek.service.ts`

### 2. **Image Analysis Module**
- **Role**: Extract metadata and features from raw image URLs
- **Input**: Image URL from Pexels
- **Output**: `ImageMetadata` with impact_score, visual_weight, composition, mood_dna, metaphorical_tags
- **Integration**: Gemini Vision API analyzes raw images asynchronously
- **File**: `image-analysis/gemini-analysis.service.ts`

### 3. **Semantic Matching Module**
- **Role**: Find semantically aligned images for narrative scenes
- **Input**: Scene intents + vector embeddings
- **Output**: Ranked ImageMatch results with detailed scoring breakdown
- **Core Logic**: Vector similarity + metadata filtering with visual anchor consistency
- **File**: `semantic-matching/semantic-matching.service.ts`

### 4. **Pexels Integration Module**
- **Role**: Sync Pexels API with rate-limiting respecting 200 req/hour limit
- **Input**: Search query (e.g., "nature", "portraits")
- **Output**: Batches of PexelsImage records ready for analysis
- **File**: `pexels-sync/pexels-integration.service.ts`

### 5. **Queue System (BullMQ)**
- **Role**: Async job processing for image analysis and embedding generation
- **Workers**: 
  - Image Analysis: 5 concurrent jobs (calls Gemini Vision API)
  - Embedding Generation: 10 concurrent jobs (generates vector embeddings)
- **Persistence**: Redis-backed queue with retry logic
- **File**: `queue/queue.service.ts`

---

## Ranking & Impact Alignment Formula

The system uses a **weighted multi-factor ranking algorithm** to score image candidates against scene requirements:

### Formula Definition

```
final_score = 
    0.5 × vector_similarity 
  + 0.3 × impact_relevance 
  + 0.15 × composition_match 
  + 0.05 × mood_consistency_score

Where:

1. vector_similarity ∈ [0, 1]
   = cosine(scene_embedding, image_embedding)
   
   Description: Measures semantic alignment between narrative intent
   and image content using 1536-dimensional embeddings from OpenAI.
   
   Weight: 0.5 (50%) - Dominant factor ensures semantic relevance


2. impact_relevance ∈ [0, 1]
   = 1 - |required_impact - image_impact_score| / 10
   = max(0, 1 - impact_difference / 10)
   
   Example: scene_required=8, image_impact=8 → score=1.0
   Example: scene_required=8, image_impact=6 → score=0.8
   
   Description: Measures how prominently the subject appears in the image.
   Compares narrative requirement (cinematically important vs background)
   against actual image analysis (1-10 scale).
   
   Weight: 0.3 (30%) - Second most important for visual hierarchy


3. composition_match ∈ [0, 1]
   = sum of matching composition properties
     - Shot type match: 0.5 (CU/MS/WS exact match)
     - Adjacent shot type: 0.25 (e.g., WS vs MS)
     - Angle match: 0.5 (low/eye/high exact match)
     - Baseline: +0.1 (any valid angle)
   
   Example: exact shot + exact angle = 1.0
   Example: adjacent shot + exact angle = 0.75
   Example: no matches = 0.1
   
   Description: Ensures visual composition aligns with narrative needs
   (wide landscapes vs close-ups, camera perspective).
   
   Weight: 0.15 (15%) - Important for framing


4. mood_consistency_score ∈ [0, 1]
   For anchor scene (i == 0): always 1.0
   
   For subsequent scenes:
       score = 1.0
       if anchor.temp ≠ image.temp:
           score -= 0.2  (temperature mismatch: warm ≠ cold)
       if anchor.primary_color differs:
           color_distance = euclidean_RGB_distance(hex1, hex2)
           normalized_distance = min(1, color_distance / 300)
           score -= normalized_distance × 0.1
       
       final_mood_score = max(0, score)
   
   Description: Soft consistency penalty ensures visual continuity across
   scenes. First image's mood (temperature, primary color, vibe) serves
   as "visual anchor" for subsequent images, but doesn't block alternatives.
   
   Weight: 0.05 (5%) - Soft constraint to allow narrative flexibility
```

### Visual Anchor Logic

The system implements **soft visual anchoring** for scene sequences:

1. **First Scene (index 0)**:
   - Mood consistency score = 1.0 (full weight)
   - No penalty for mood mismatches
   - All images ranked purely by semantic + impact + composition fit

2. **Subsequent Scenes (index > 0)**:
   - Capture visual anchor from highest-ranking image of scene 0
   - Apply soft penalty (max -0.2 for temperature, -0.1 for color)
   - Images with mismatched mood get lower scores but aren't rejected
   - Allows narrative moments where visual break makes cinematic sense

### Example Calculation

```
Scene: "A lone figure standing in a misty field at dawn"
Required Impact: 8 (subject must be prominent)
Preferred Composition: { negative_space: "left", shot_type: "WS", angle: "eye" }

Candidate Image Analysis:
- vector_similarity = 0.87 (strong semantic match)
- impact_score = 8 (figure is focal point)
  → impact_relevance = 1.0 (perfect match)
- composition = { negative_space: "left", shot_type: "WS", angle: "eye" }
  → composition_match = 1.0 (all properties match)
- mood_dna = { temp: "warm", primary_color: "#E8D4C0", vibe: "ethereal" }
- Is anchor scene:
  → mood_consistency_score = 1.0

FINAL SCORE = (0.5 × 0.87) + (0.3 × 1.0) + (0.15 × 1.0) + (0.05 × 1.0)
            = 0.435 + 0.3 + 0.15 + 0.05
            = 0.935 ✓ Excellent match
```

---

## Database Schema

### Key Models

**PexelsImage**
```
- id: String (primary)
- pexelsId: String (unique)
- url: String
- photographer: String
- width, height: Int
- avgColor: String
- createdAt, updatedAt: DateTime
```

**ImageEmbedding**
```
- id: String (primary)
- imageId: String (FK to PexelsImage)
- embedding: Vector(1536)  ← pgvector type
- createdAt, updatedAt: DateTime
```

**ImageMetadata**
```
- id: String (primary)
- imageId: String (FK, unique)
- impactScore: Float [1.0-10.0]
- visualWeight: Float [1.0-10.0]
- composition: JSON
  {
    "negative_space": "left" | "right" | "center",
    "shot_type": "CU" | "MS" | "WS",
    "angle": "low" | "eye" | "high"
  }
- moodDna: JSON
  {
    "temp": "warm" | "cold",
    "primary_color": "#RRGGBB",
    "vibe": "minimalist" | "cinematic" | ...
  }
- metaphoricalTags: String[] (max 15)
```

**ImageAnalysisJob**
```
- id: String (primary)
- imageId: String (FK)
- status: PENDING | IN_PROGRESS | COMPLETED | FAILED
- retryCount: Int
- maxRetries: Int (default 3)
- errorMessage: String
- result: JSON (raw Gemini response)
```

**SceneIntent**
```
- id: String (primary)
- projectId: String (FK to narrative)
- sceneIndex: Int (order in narrative)
- intent: String (visual description)
- requiredImpact: Float [1.0-10.0]
- composition: JSON (same structure as ImageMetadata)
- moodAnchor: JSON (set after first image selected)
- createdAt, updatedAt: DateTime
```

---

## API Endpoints

### POST `/alignment/extract-visual-intent`
Extract scene intents from raw Gemini text.

**Request**:
```json
{
  "raw_gemini_text": "A solitary figure walks through an endless desert..."
}
```

**Response**:
```json
[
  {
    "intent": "A solitary figure walking through desert",
    "required_impact": 8,
    "preferred_composition": {
      "negative_space": "right",
      "shot_type": "WS",
      "angle": "eye"
    }
  }
]
```

### POST `/alignment/find-images`
Find semantically aligned images for scenes.

**Request**:
```json
{
  "scenes": [
    {
      "intent": "A solitary figure walking through desert",
      "required_impact": 8,
      "preferred_composition": { ... }
    }
  ],
  "top_k": 5,
  "mood_consistency_weight": 1.0
}
```

**Response**:
```json
[
  [
    {
      "image_id": "uuid",
      "pexels_id": "12345",
      "url": "https://images.pexels.com/...",
      "match_score": 0.935,
      "vector_similarity": 0.87,
      "impact_relevance": 1.0,
      "composition_match": 1.0,
      "mood_consistency_score": 1.0,
      "metadata": { ... }
    },
    ...
  ]
]
```

### POST `/alignment/sync-pexels`
Trigger Pexels library sync.

**Request**:
```json
{
  "search_query": "nature",
  "batch_size": 50
}
```

**Response**:
```json
{
  "total_images": 1000,
  "total_batches": 20,
  "job_ids": ["job-1", "job-2", ...],
  "status": "queued"
}
```

### GET `/alignment/stats`
Get library and processing statistics.

**Response**:
```json
{
  "total_images": 50000,
  "total_embeddings": 48500,
  "pending_analysis_jobs": 1500,
  "failed_jobs": 10,
  "ready_for_search": 48500
}
```

---

## Processing Pipeline

### Image Ingestion Flow

```
1. Pexels API Pagination
   └─ Batch of 50 images fetched respecting 200 req/hour limit

2. Database Ingestion
   └─ PexelsImage records upserted (avoid duplicates)
   └─ ImageAnalysisJob created with PENDING status

3. Queue Image Analysis Job
   └─ BullMQ adds job to "image-analysis" queue
   └─ Worker calls GeminiVisionAPI on image URL

4. Gemini Analysis (concurrent: 5 workers)
   └─ Extracts: impact_score, visual_weight, composition, mood_dna, metaphorical_tags
   └─ Stores ImageMetadata in database

5. Queue Embedding Generation
   └─ BullMQ adds job to "embedding-generation" queue

6. Embedding Generation (concurrent: 10 workers)
   └─ Calls OpenAI text-embedding-3-small on metadata text
   └─ Stores 1536-dim vector in ImageEmbedding with pgvector

7. Image Ready for Search
   └─ Once ImageEmbedding exists, image is searchable
```

---

## Error Handling

### Batch Failure Model
- If >10% of images in a batch fail analysis, entire sync fails
- Explicit retry required (prevents partial ingestion)
- Per-image errors logged but don't block batch progression

### Retry Logic
- **ImageAnalysisJob**: Up to 3 retries with exponential backoff
- **DeepSeek API**: Retry on 429 (rate limit) with 1s, 2s, 4s delays
- **Gemini API**: Retry on 429/503 (rate limit/service unavailable)
- **Pexels API**: Automatic rate-limit respecting (200 req/hour sliding window)

### Fallback Strategies
- **Missing Metadata**: Default values provided (impact=5, mood=neutral)
- **Failed Embeddings**: Image available in search but with reduced ranking
- **API Exhaustion**: Return results from cache or limit scope

---

## Configuration

Set in `.env`:

```bash
DEEPSEEK_API_KEY=sk-...
GEMINI_API_KEY=AIza...
PEXELS_API_KEY=...
REDIS_URL=redis://localhost:6379
BATCH_FAILURE_THRESHOLD=0.1
EMBEDDING_MODEL=text-embedding-3-small
```

---

## Testing

Run tests:
```bash
npm run test
```

Key test coverage:
- AlignmentService: Endpoint validation, error handling
- DeepSeekService: JSON parsing, retry logic, composition normalization
- SemanticMatchingService: Ranking formula correctness, visual anchor logic, color distance
- PexelsIntegrationService: Rate limiting, pagination, error recovery

---

## Performance Notes

### Scalability to 1M Images

**pgvector HNSW Index**:
- O(log n) search complexity for 1M embeddings
- ~10-50ms query time depending on recall requirement
- ~1GB RAM for 1M × 1536-dim vectors

**Metadata Filtering**:
- Composite index on (mood_dna->temp, impact_score) reduces candidate set
- Typical query returns 500-5000 candidates before ranking

**Ranking**:
- O(1) per candidate (linear combination of 4 scores)
- Top-K results: ~10-50ms for returning top 5 images

**Async Processing**:
- 5 concurrent Gemini analysis workers = ~240 images/hour
- Full 1M library sync = ~5,000 hours of clock time (streamable over weeks)
- 10 concurrent embedding workers = ~3,600 embeddings/hour

---

## Future Enhancements

1. **Advanced Embedding Models**: Switch from OpenAI to open-source (sentence-transformers)
2. **Multi-modal Embeddings**: Joint text+image embeddings for better scene-image alignment
3. **User Feedback Loop**: Track which images editors prefer, retrain impact scores
4. **Metaphorical Tag Clustering**: Group semantically similar tags ("solitude" ≈ "loneliness")
5. **Temporal Consistency**: Track mood transitions between scenes (warm → cold gradient)
6. **Custom Preference Weights**: Allow users to adjust the 0.5/0.3/0.15/0.05 weights

---

**Version**: 1.0.0  
**Last Updated**: February 2026  
**Maintainers**: Vision-IQ Team
