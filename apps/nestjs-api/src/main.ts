import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
	const { env } = await import("@repo/env");
	const app = await NestFactory.create(AppModule);
	app.enableCors();
	await app.listen(env.API_NEST_PORT);
}

void bootstrap();
