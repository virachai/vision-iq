# Vision-IQ Architecture & Flow Diagrams

## 1. High-Level System Architecture

```mermaid
graph TD
    User[User / Client] -->|Narrative Input| API[NestJS API]
    API -->|1. Parse & align| Alignment[Alignment Service]

    subgraph "Core Services"
        Alignment -->|Extract Intent| Gemini[Gemini Live Service]
        Alignment -->|Refine Structure| DeepSeek[DeepSeek Service]
        Alignment -->|Fetch Images| Pexels[Pexels Sync Service]
    end

    subgraph "Data Persistence"
        DB[(PostgreSQL + pgvector)]
        Redis[(Redis Queue)]
    end

    Alignment -->|Store Results| DB
    Pexels -->|Async Ingest| Redis
    Redis -->|Process Image| ImageWorker[Image Analysis Worker]
    ImageWorker -->|Update Metadata| DB
```

## 2. Alignment Module Workflow

This diagram details the "Visual Intent Extraction" and "Image Alignment" process.

```mermaid
sequenceDiagram
    participant C as Client
    participant A as AlignmentController
    participant S as AlignmentService
    participant G as GeminiService
    participant D as DeepSeekService
    participant P as PexelsSyncService
    participant DB as Database

    C->>A: POST /alignment/process (narrative)
    A->>S: process(narrative)
    S->>G: extractVisualIntent(narrative)
    G-->>S: Raw Analysis Stream
    S->>D: refineIntent(rawAnalysis)
    D-->>S: Structured SceneIntent[]

    loop For Each Intent
        S->>DB: Save SceneIntent
        S->>D: expandDescription(intent)
        D-->>S: VisualDescription[]
        S->>DB: Save VisualDescriptions

        opt Auto-Sync Enabled
            S->>P: syncImages(description)
            P->>P: Call Pexels API
            P->>DB: Upsert Images & Link
        end
    end

    S-->>A: AlignmentResult
    A-->>C: JSON Response
```

## 3. Image Ingestion & Analysis Pipeline

How images are enriched with metadata after being fetched.

```mermaid
stateDiagram-v2
    [*] --> Pending: Image Fetched
    Pending --> Processing: Job Picked by Worker
    Processing --> Analyzing: Gemini Vision Analysis
    Analyzing --> Embedding: Generate Vector
    Embedding --> Completed: Save to DB

    Processing --> Failed: Error
    Failed --> Pending: Retry (max 3)
    Failed --> DeadLetter: Max Retries Exceeded
```

## 4. Entity Relationship (Simplified)

```mermaid
erDiagram
    SceneIntent ||--|{ VisualDescription : expands_to
    VisualDescription ||--|{ PexelsImageDescription : links
    PexelsImage ||--|{ PexelsImageDescription : appears_in
    PexelsImage ||--|| ImageMetadata : has
    VisualDescription {
        string text
        json composition
        float weight
    }
    PexelsImage {
        int id
        string url
        string photographer
    }
```
