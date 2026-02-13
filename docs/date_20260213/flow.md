# Vision-IQ Alignment Service Flow

This document illustrates the end-to-end workflow of the Narrative-to-Video Image Alignment Service.

## 🔄 System Flowchart

```mermaid
graph TD
    %% Input Layer
    User([User Narrative Input]) --> API[NestJS API Orchestration]

    %% Narrative Processing
    subgraph Narrative_Processing [Narrative Processing]
        API --> DS_Narrative[DeepSeek: Narrative Parsing]
        DS_Narrative --> Structured_Narrative[Structured Storyboard Data]
    end

    %% Asset Fetching
    subgraph Asset_Sourcing [Asset Sourcing]
        Structured_Narrative --> Pexels[Pexels Image Sync]
        Pexels --> Raw_Images[Raw Image Assets]
    end

    %% Async Job Processing
    subgraph Async_Analysis [Async Visual Analysis]
        Raw_Images --> Queue[BullMQ / Redis Job Queue]
        Queue --> Gemini[Gemini Live: Visual Metadata Extraction]
        Gemini --> DS_Refine[DeepSeek: Data Refinement/JSON Parsing]
        DS_Refine --> Vector_Store[(pgvector: Storage & HNSW Embedding)]
    end

    %% Alignment & Ranking
    subgraph Alignment_Logic [Alignment & Alignment Engine]
        Structured_Narrative --> Align[Ranking & Sequence Alignment]
        Vector_Store -.-> Align
        Align --> Scoring[4-Factor Scoring: Vector + Impact + Composition + Mood]
    end

    %% Output
    Scoring --> Output[Aligned Image Sequence]
    Output --> Dashboard[NextJS Dashboard Preview]
    Output --> Video[Video Synthesis Module]

    %% Styling
    style Gemini fill:#4285F4,stroke:#fff,color:#fff
    style DS_Narrative fill:#18A0FB,stroke:#fff,color:#fff
    style DS_Refine fill:#18A0FB,stroke:#fff,color:#fff
    style Vector_Store fill:#336791,stroke:#fff,color:#fff
    style Queue fill:#D82C20,stroke:#fff,color:#fff
```

## 🧩 Component Relationships

| Step              | Component            | Description                                                                 |
| :---------------- | :------------------- | :-------------------------------------------------------------------------- |
| **1. Input**      | **NestJS API**       | Orchestrates the entire lifecycle of a video project.                       |
| **2. Parsing**    | **DeepSeek-V3**      | Breaks down raw text into visual prompts and requirements.                  |
| **3. Sourcing**   | **Pexels API**       | Streams relevant image candidates based on prompts.                         |
| **4. Analysis**   | **Gemini Live**      | Analyzes images for complex attributes (lighting, composition).             |
| **5. Refinement** | **DeepSeek-V3**      | Converts raw Gemini talk into structured metadata (Impact Score, Mood DNA). |
| **6. Search**     | **pgvector**         | Performs semantic similarity search using HNSW indexing.                    |
| **7. Ranking**    | **Alignment Engine** | Custom logic for visual coherence and sequence alignment.                   |
| **8. Display**    | **NextJS**           | Real-time visualization of the results for the user.                        |
