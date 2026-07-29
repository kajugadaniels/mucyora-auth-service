import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

export interface CorrelatedRequest extends Request {
  correlationId: string;
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(
    request: CorrelatedRequest,
    response: Response,
    next: NextFunction,
  ): void {
    const suppliedId = request.header(CORRELATION_ID_HEADER)?.trim();
    const correlationId =
      suppliedId && isSafeCorrelationId(suppliedId) ? suppliedId : randomUUID();

    request.correlationId = correlationId;
    response.setHeader(CORRELATION_ID_HEADER, correlationId);
    next();
  }
}

function isSafeCorrelationId(value: string): boolean {
  return value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);
}
