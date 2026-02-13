---
trigger: always_on
---

# 🛡️ Database Protection Rule

## 🎯 Objective

Prevent accidental data loss and maintain database integrity by restricting destructive database operations.

---

## 🚫 Forbidden Actions

Google AntiGravity Assistant is **STRICTLY FORBIDDEN** from performing the following actions without explicit user confirmation:

1. **Database Resets**:

   - `npx prisma migrate reset`
   - `prisma db push --force-reset`
   - Any command that wipes the database or deletes all data.

2. **Destructive Schema Changes**:

   - `DROP DATABASE`
   - `DROP TABLE`
   - `TRUNCATE TABLE` (unless explicitly requested for testing purposes)
   - `DROP SCHEMA`

3. **Data Deletion**:
   - Large-scale `DELETE` operations without a strict `WHERE` clause.

---

## ⚠️ Safe Operation Protocol

Whenever a database operation is required:

1. **Self-Check**: Evaluate if the command will result in data loss.
2. **Warn the User**: If data loss is possible, warn the user clearly with a `[!CAUTION]` or `[!WARNING]`.
3. **Request Confirmation**: Ask the user for explicit approval before executing any destructive command.
   - _Example_: "Running `prisma migrate reset` will delete all data. Are you sure you want to proceed?"

---

## ✅ Permitted Actions

- Creating tables/columns (`prisma migrate dev` or `prisma db push` without flags).
- Inserting or updating records.
- Selecting or reading data.
- Backing up data.
