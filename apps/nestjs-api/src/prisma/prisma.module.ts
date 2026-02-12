import { Global, Module } from "@nestjs/common";
import { PrismaClient, prisma } from "@repo/database";

@Global()
@Module({
  providers: [
    {
      provide: PrismaClient,
      useValue: prisma,
    },
  ],
  exports: [PrismaClient],
})
export class PrismaModule {}
