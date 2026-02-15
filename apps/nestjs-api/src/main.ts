import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const { env } = await import("@repo/env");
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: "*", // For development. Lock down in production.
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
        exposeDefaultValues: true,
      },
      // Enable detailed validation errors for debugging
      disableErrorMessages: false,
      validationError: {
        target: false,
        value: true,
      },
    }),
  );

  await app.listen(env.NESTJS_API_PORT);
  console.log(
    `🚀 Server is running on: http://localhost:${env.NESTJS_API_PORT}`,
  );
}

void bootstrap();
