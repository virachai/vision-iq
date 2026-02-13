# API Curl Examples

This document provides example `curl` commands for interacting with the Vision IQ API.

## Base URL

The default base URL is `http://localhost:3006`.

## Alignment API

### Extract Visual Intent

Extract scene visual intents from raw Gemini Live text.

```bash
curl -X POST http://localhost:3006/alignment/extract-visual-intent \
     -H "Content-Type: application/json" \
     -d '{
       "raw_gemini_text": "I want a scene with a lone tree in a field at sunset, followed by a close up of the bark."
     }'
```

---

### Find Aligned Images

Find semantically aligned images for a sequence of scenes.

```bash
curl -X POST http://localhost:3006/alignment/find-images \
     -H "Content-Type: application/json" \
     -d '{
       "scenes": [
         {
           "intent": "lone tree in a field at sunset",
           "required_impact": 8.0,
           "preferred_composition": {
             "negative_space": "right",
             "shot_type": "WS",
             "angle": "eye"
           }
         },
         {
           "intent": "close up of tree bark",
           "required_impact": 10.0,
           "preferred_composition": {
             "negative_space": "center",
             "shot_type": "CU",
             "angle": "eye"
           }
         }
       ],
       "top_k": 5,
       "mood_consistency_weight": 0.05
     }'
```

---

### Sync Pexels

Trigger Pexels library sync to populate the database.

```bash
curl -X POST http://localhost:3006/alignment/sync-pexels \
     -H "Content-Type: application/json" \
     -d '{
       "search_query": "nature",
       "batch_size": 20
     }'
```

---

### Get Stats

Get sync and analysis statistics.

```bash
curl -X GET http://localhost:3006/alignment/stats
```

## Links API

### Create Link

```bash
curl -X POST http://localhost:3006/links \
     -H "Content-Type: application/json" \
     -d '{
       "title": "Example Link",
       "url": "https://example.com",
       "description": "A description of the link"
     }'
```

---

### Find All Links

```bash
curl -X GET http://localhost:3006/links
```

---

### Find One Link

```bash
curl -X GET http://localhost:3006/links/1
```

---

### Update Link

```bash
curl -X PATCH http://localhost:3006/links/1 \
     -H "Content-Type: application/json" \
     -d '{
       "title": "Updated Title"
     }'
```

---

### Delete Link

```bash
curl -X DELETE http://localhost:3006/links/1
```

## App Root

### Get Hello

```bash
curl -X GET http://localhost:3006/
```
