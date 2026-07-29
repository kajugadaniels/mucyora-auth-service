import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { parseAllowedOrigins } from '../../config/environment.validation';

export function buildCorsOptions(allowedOriginValue: string): CorsOptions {
  const allowedOrigins = parseAllowedOrigins(allowedOriginValue);

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(
        new Error('Origin is not allowed by the Auth CORS policy'),
        false,
      );
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      CORRELATION_HEADER,
      'X-CSRF-Token',
    ],
    exposedHeaders: [CORRELATION_HEADER, 'Retry-After'],
    credentials: true,
    maxAge: 86_400,
  };
}

const CORRELATION_HEADER = 'X-Correlation-Id';
