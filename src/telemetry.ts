import { NodeSDK } from '@opentelemetry/sdk-node';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';

const enabled = process.env.OTEL_ENABLED === 'true';
const telemetry = enabled
  ? new NodeSDK({
      instrumentations: [
        new HttpInstrumentation({
          ignoreIncomingRequestHook: (request) =>
            request.url === '/health/live',
        }),
        new NestInstrumentation(),
        new IORedisInstrumentation(),
        new PgInstrumentation(),
      ],
    })
  : null;

telemetry?.start();

export async function shutdownTelemetry(): Promise<void> {
  await telemetry?.shutdown();
}
