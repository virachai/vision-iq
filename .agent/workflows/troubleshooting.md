---
description: Workflow for debugging issues and checking logs.
---

# Troubleshooting Workflow

Use this workflow when you encounter errors or unexpected behavior.

1. Check application logs
   // turbo

```bash
pnpm run logs
```

2. Run tests in watch mode to isolate issues

```bash
pnpm run test:watch
```

3. Check environment variables

```bash
cat .env
```

4. Verify database connection
   // turbo

```bash
npx prisma db pull
```
