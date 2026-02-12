# Vision IQ

A full-stack monorepo powered by **Turborepo**, containing multiple frontend applications and backend APIs with shared packages.

## Tech Stack

| Layer        | Technology                                                     |
| ------------ | -------------------------------------------------------------- |
| Monorepo     | [Turborepo](https://turborepo.dev/) + [pnpm](https://pnpm.io) |
| Language     | [TypeScript](https://www.typescriptlang.org/)                  |
| Database     | [PostgreSQL](https://www.postgresql.org/) + [Prisma](https://www.prisma.io/) |
| Auth         | [NextAuth.js](https://next-auth.js.org/) v5                    |
| Linting      | [Biome](https://biomejs.dev/)                                  |
| Testing      | [Jest](https://jestjs.io/)                                     |

## Project Structure

```
vision-iq/
├── apps/
│   ├── admin/             # Admin panel — Vite + React
│   ├── api/               # REST API — Express
│   ├── blog/              # Blog — Remix
│   ├── nestjs-api/        # REST API — NestJS
│   ├── nextjs-dashboard/  # Dashboard — Next.js (Auth, Postgres)
│   ├── prisma-web/        # Web app — Next.js + Prisma
│   └── storefront/        # Storefront — Next.js
├── packages/
│   ├── api/               # Shared API DTOs & types (NestJS mapped-types)
│   ├── biome-config/      # Shared Biome config (@repo/biome-config)
│   ├── config-env/        # Env validation with Zod (@repo/env)
│   ├── config-typescript/ # Shared tsconfig presets (@repo/typescript-config)
│   ├── database/          # Prisma client & migrations (@repo/database)
│   ├── jest-config/       # Jest configuration
│   ├── jest-presets/      # Jest presets for node & browser (@repo/jest-presets)
│   ├── logger/            # Isomorphic logger (@repo/logger)
│   ├── shared/            # Shared utilities (@repo/shared)
│   └── ui/                # React component library (@repo/ui)
└── scripts/
    └── kill-ports.sh      # Kill processes on all project ports
```

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **pnpm** 8.15.6
- **PostgreSQL** database

### Setup

1. **Clone the repository**

   ```sh
   git clone <repo-url>
   cd vision-iq
   ```

2. **Install dependencies**

   ```sh
   pnpm install
   ```

3. **Configure environment variables**

   ```sh
   cp .env.example .env
   ```

   Edit `.env` with your values:

   ```env
   # Database
   POSTGRES_URL="postgresql://user:password@localhost:5432/dbname?sslmode=require"

   # Auth
   AUTH_SECRET="your-auth-secret-here"
   AUTH_URL="http://localhost:3000/api/auth"

   # App Ports
   API_NEST_PORT=4000
   API_EXPRESS_PORT=5001
   ADMIN_PORT=3001
   BLOG_PORT=3004
   NEXTJS_DASHBOARD_PORT=3003
   PRISMA_WEB_PORT=3005
   STOREFRONT_PORT=3002
   ```

4. **Set up the database**

   ```sh
   pnpm --filter @repo/database generate
   pnpm --filter @repo/database db:push
   ```

5. **Seed the database** _(optional)_

   ```sh
   pnpm --filter @repo/database db:seed
   ```

## Development

Start all apps and packages in development mode:

```sh
pnpm dev
```

### Default Ports

| App                | Port  |
| ------------------ | ----- |
| Admin              | 3001  |
| Storefront         | 3002  |
| Next.js Dashboard  | 3003  |
| Blog               | 3004  |
| Prisma Web         | 3005  |
| NestJS API         | 4000  |
| Express API        | 5001  |

### Useful Commands

| Command              | Description                       |
| -------------------- | --------------------------------- |
| `pnpm dev`           | Start all apps in dev mode        |
| `pnpm build`         | Build all apps and packages       |
| `pnpm start`         | Start all apps in production mode |
| `pnpm lint`          | Lint all packages with Biome      |
| `pnpm format`        | Format code with Biome            |
| `pnpm test`          | Run all tests                     |
| `pnpm check-types`   | Type-check all packages           |
| `pnpm clean`         | Clean build artifacts             |

### Database Commands

Run from the `@repo/database` package:

```sh
pnpm --filter @repo/database db:migrate:dev   # Create a new migration
pnpm --filter @repo/database db:migrate:deploy # Apply pending migrations
pnpm --filter @repo/database db:push           # Push schema to database
pnpm --filter @repo/database db:seed           # Seed the database
pnpm --filter @repo/database studio            # Open Prisma Studio
```

### Kill Occupied Ports

```sh
bash scripts/kill-ports.sh
```
