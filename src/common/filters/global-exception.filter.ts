import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { CorrelatedRequest } from '../middleware/correlation-id.middleware';

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error?: string;
  code?: string;
  path: string;
  timestamp: string;
  correlationId?: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>() as CorrelatedRequest;
    const response = http.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      this.logger.error({
        event: 'request_failed',
        statusCode: status,
        method: request.method,
        path: request.originalUrl,
        correlationId: request.correlationId,
        exception:
          exception instanceof Error
            ? { name: exception.name }
            : { name: 'UnknownError' },
      });
    }

    response
      .status(status)
      .json(this.buildResponse(exception, status, request));
  }

  private buildResponse(
    exception: unknown,
    status: number,
    request: CorrelatedRequest,
  ): ErrorResponse {
    const base = {
      statusCode: status,
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
      correlationId: request.correlationId,
    };

    if (!(exception instanceof HttpException)) {
      return {
        ...base,
        message: 'An unexpected error occurred.',
        error: 'Internal Server Error',
      };
    }

    const body = exception.getResponse();
    if (typeof body === 'string') {
      return { ...base, message: body };
    }

    const record = body as Record<string, unknown>;
    return {
      ...base,
      message: normalizeMessage(record.message),
      error: typeof record.error === 'string' ? record.error : undefined,
      code:
        typeof record.code === 'string' &&
        /^[A-Z][A-Z0-9_]{2,63}$/.test(record.code)
          ? record.code
          : undefined,
    };
  }
}

function normalizeMessage(value: unknown): string | string[] {
  if (typeof value === 'string') {
    return value;
  }

  if (
    Array.isArray(value) &&
    value.every((item): item is string => typeof item === 'string')
  ) {
    return value;
  }

  return 'Request failed.';
}
