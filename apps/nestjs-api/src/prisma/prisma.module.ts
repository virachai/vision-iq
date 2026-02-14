import { Global, Module } from "@nestjs/common";
import { PrismaClient } from "@repo/database";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

export const PG_POOL = "PG_POOL";
export const PRISMA_SERVICE = "PRISMA_SERVICE";

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: () => {
        const connectionString = process.env.DATABASE_URL;
        return new Pool({
          connectionString,
          ssl: {
            rejectUnauthorized: false, // For development with Supabase self-signed certs
          },
          // Optimization: Performance and Concurrency
          max: 20, // Increase pool size for higher worker concurrency
          connectionTimeoutMillis: 5000, // Fail fast on connection issues
          idleTimeoutMillis: 10000, // Close idle connections faster
        });
      },
    },
    {
      provide: PrismaClient,
      useFactory: (pool: Pool) => {
        const adapter = new PrismaPg(pool);
        return new PrismaClient({ adapter });
      },
      inject: [PG_POOL],
    },
    {
      provide: PRISMA_SERVICE,
      useExisting: PrismaClient,
    },
  ],
  exports: [PrismaClient, PG_POOL, PRISMA_SERVICE],
})
export class PrismaModule {
  constructor() {
    console.log("PrismaModule initialized with local instantiation.");
  }
}
