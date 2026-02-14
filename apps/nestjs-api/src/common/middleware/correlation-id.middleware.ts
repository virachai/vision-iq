import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { requestContext, CORRELATION_ID_KEY } from "../request-context";

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const correlationId =
      (req.headers["x-correlation-id"] as string) || randomUUID();

    // Set header for downstream
    req.headers["x-correlation-id"] = correlationId;
    res.setHeader("X-Correlation-ID", correlationId);

    const store = new Map<string, any>();
    store.set(CORRELATION_ID_KEY, correlationId);

    requestContext.run(store, () => {
      next();
    });
  }
}
