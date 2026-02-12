import { Module } from "@nestjs/common";

import { AlignmentModule } from "./alignment/alignment.module";
import { LinksModule } from "./links/links.module";

import { AppController } from "./app.controller";
import { AppService } from "./app.service";

@Module({
	imports: [LinksModule, AlignmentModule],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}
