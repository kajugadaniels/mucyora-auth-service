import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class PerformanceTelemetryMiddleware implements NestMiddleware {
  private readonly logger = new Logger(PerformanceTelemetryMiddleware.name);

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();
    response.once('finish', () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.logger.log({
        event: 'http_request_completed',
        method: request.method,
        route: normalizedRoute(request.path),
        statusCode: response.statusCode,
        durationMs: Number(durationMs.toFixed(3)),
      });
    });
    next();
  }
}

function normalizedRoute(path: string): string {
  return path
    .replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi,
      '/:id',
    )
    .replace(/\/[A-Za-z0-9._:-]{24,}(?=\/|$)/g, '/:value');
}
