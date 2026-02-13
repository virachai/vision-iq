import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const { env } = await import("@repo/env");
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(env.NESTJS_API_PORT);
}

void bootstrap();
