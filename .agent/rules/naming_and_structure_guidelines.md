# 📏 Google AntiGravity — Naming & File Structure Standards

> **Status**: Production Grade  
> **Role**: Lead Developer Guideline  
> **Goal**: Consistency, Compatibility, and Maintainability

This document defines the strict naming conventions and file structure rules for the `Google AntiGravity` project (specifically `vision-iq` monorepo). Adherence is mandatory for all contributors.

---

## 1. Directory & File Structure (NestJS Specific)

### 1.1 Directory Naming (`kebab-case`)

All directories must be `kebab-case`. Group related files by **feature/module** (Modular Architecture), not by type (Layered Architecture).

**✅ Correct:**

```
src/
  auth/
  user-profile/
  payment-gateway/
```

**❌ Incorrect:**

```
src/
  Auth/
  UserProfile/
  controllers/
  services/
```

### 1.2 File Naming (`kebab-case.suffix.ts`)

Files must follow `kebab-case` with specific suffixes based on their role.

| Role            | Suffix Pattern       | Example                |
| --------------- | -------------------- | ---------------------- |
| Module          | `.module.ts`         | `auth.module.ts`       |
| Controller      | `.controller.ts`     | `auth.controller.ts`   |
| Service         | `.service.ts`        | `auth.service.ts`      |
| DTO             | `.dto.ts`            | `create-user.dto.ts`   |
| Entity (Prisma) | (In `schema.prisma`) | `User`, `SceneIntent`  |
| Interface       | `.interface.ts`      | `user.interface.ts`    |
| Guard           | `.guard.ts`          | `jwt-auth.guard.ts`    |
| Strategy        | `.strategy.ts`       | `jwt.strategy.ts`      |
| Pipe            | `.pipe.ts`           | `validation.pipe.ts`   |
| Middleware      | `.middleware.ts`     | `logger.middleware.ts` |
| Spec (Tests)    | `.spec.ts`           | `auth.service.spec.ts` |

---

## 2. Code Naming Conventions

### 2.1 Classes (`PascalCase`)

```typescript
export class AuthService {}
export class CreateUserDto {}
export class JwtAuthGuard {}
```

### 2.2 Methods & Functions (`camelCase`)

```typescript
async validateUser() {}
function mapToDto() {}
```

### 2.3 Variables & Properties (`camelCase`)

```typescript
const secretKey = "xyz";
const userProfile = { id: 1 };
```

### 2.4 Constants (`UPPER_SNAKE_CASE`)

```typescript
const MAX_RETRY_COUNT = 5;
const DEFAULT_TIMEOUT_MS = 3000;
```

---

## 3. DTO Standardization (Critical)

**Rule:** All DTO properties **MUST** be `camelCase` in TypeScript code to maintain consistency with the rest of the application.

### 3.1 Handling External snake_case JSON through Class Transformation

When dealing with external APIs (like Vision LLMs, Python services, or legacy systems) that return `snake_case`, **DO NOT** let `snake_case` leak into your TypeScript codebase.

Use `class-transformer`'s `@Expose` decorator to map the incoming JSON property to a `camelCase` class property.

**❌ Incorrect (Mixed Case Leakage):**

```typescript
export class SceneIntentDto {
  intent: string;
  // ⛔ Bad: Pollutes TS code with snake_case
  required_impact: number;
  visual_intent: any;
}
```

**✅ Correct (Production Grade):**

```typescript
import { Expose } from "class-transformer";

export class SceneIntentDto {
  @Expose()
  intent: string;

  @Expose({ name: "required_impact" })
  requiredImpact: number; // TS property is camelCase 🐪

  @Expose({ name: "preferred_composition" })
  preferredComposition: any;
}
```

### 3.2 Validation Decorators

All DTOs **MUST** use `class-validator` decorators to ensure data integrity.

```typescript
import { IsString, IsNumber, Min, Max } from "class-validator";

export class CreateUserDto {
  @IsString()
  @Expose()
  username: string;

  @IsNumber()
  @Min(18)
  @Expose({ name: "user_age" })
  age: number;
}
```

---

## 4. Database Naming (Prisma/PostgreSQL)

### 4.1 Tables (`snake_case` mapped to `PascalCase`)

PostgreSQL tables should be `snake_case` (often plural). Prisma models map them to `PascalCase`.

**`schema.prisma`:**

```prisma
model UserProfile {
  id        String   @id
  // ...
  @@map("vision_iq_user_profiles") // Table name in DB
}
```

### 4.2 Columns (`camelCase` in Prisma, `snake_case` in DB)

Use `@map` to handle the conversion automatically.

**`schema.prisma`:**

```prisma
model User {
  firstName String @map("first_name") // DB: first_name, TS: firstName
  lastName  String @map("last_name")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt      @map("updated_at")
}
```

**Why?** This keeps the database strict and idiomatic (`snake_case`) while keeping TypeScript redundant and clean (`camelCase`).

---

## 5. Interface & Type Definition

### 5.1 Interfaces (`PascalCase`)

Do not prefix with `I`.

**✅ Correct:**

```typescript
interface UserData {}
```

**❌ Incorrect:**

```typescript
interface IUserData {}
```

---

## 6. Summary Checklist

- [ ] Directory names are `kebab-case`.
- [ ] File names are `kebab-case.suffix.ts`.
- [ ] Class names are `PascalCase`.
- [ ] API DTOs use `camelCase` properties, mapped via `@Expose({ name: 'snake_case' })` if needed.
- [ ] Database columns are mapped to `camelCase` in Prisma schema using `@map("snake_case")`.
- [ ] No `any` types unless absolutely necessary (use `unknown` or specific types).
- [ ] All DTOs have validation decorators.

---

**Effective Date:** 2026-02-14  
**Enforced By:** Lead Developer / CI Pipeline
