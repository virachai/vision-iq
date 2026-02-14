# Vision-IQ Operational Runbook

## 🟢 System Startup

### 1. Prerequisites

- Node.js >= 18
- pnpm >= 8
- PostgreSQL with `pgvector` extension enabled
- Redis (for BullMQ)

### 2. Environment Variables

Ensure `.env` acts as the source of truth. Required keys for Alignment Module:

```env
GEMINI_API_KEY=...
DEEPSEEK_API_KEY=...
PEXELS_API_KEY=...
DATABASE_URL=...
```

### 3. Start Development Server

```bash
# Start the API and dependent services
pnpm dev --filter=nestjs-api
```

---

## 🔄 Common Operations

### Database Migrations

If you modify the Prisma schema (e.g., adding new alignment fields):

```bash
# Apply changes
pnpm db:migrate

# Reset (Caution: Data Loss)
# pnpm db:reset
```

### Running Tests

Validate the Alignment Module logic:

```bash
pnpm test --filter=nestjs-api
```

---

## ⚠️ Troubleshooting

### Issue: Pexels Rate Limited

**Symptom**: `429 Too Many Requests` in logs.
**Action**:

1. Check `PexelsSyncService` logs.
2. The service handles 200 req/hour. If exceeded, wait for the reset window (usually top of the hour).
3. **Temp Fix**: Disable `auto_match` in the alignment request payload.

### Issue: Gemini Connection Failed

**Symptom**: WebSocket error or timeout in `GeminiAnalysisService`.
**Action**:

1. Verify internet connectivity.
2. Check `GEMINI_API_KEY` validity.
3. Restart the `nestjs-api` service to reset specific connection pools.

### Issue: "Visual Description Not Found"

**Symptom**: Images not linking to descriptions.
**Action**:

1. Verify `PexelsImageDescription` join table entries.
2. Ensure `VisualDescription` was created _before_ the sync triggered.

---

## 📊 Monitoring

- **BullMQ Dashboard**: Access at `/admin/queues` (if enabled) to view image processing jobs.
- **Logs**: Check standard output for `[Nest]` and `[DeepSeekService]` tags.
