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
        return new Pool({ connectionString });
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
