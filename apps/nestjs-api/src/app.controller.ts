import { Controller, Get, Post } from "@nestjs/common";
import { AppService } from "./app.service";
import { QueueService } from "./queue/queue.service";

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly queueService: QueueService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post("maintenance/requeue-fallback")
  async requeueFallback() {
    const count = await this.queueService.requeueFallbackJobs();
    return {
      message: `Re-queued ${count} fallback jobs for analysis`,
      count,
    };
  }
}
