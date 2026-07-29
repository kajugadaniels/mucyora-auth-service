import { ConsoleLogger, Injectable } from '@nestjs/common';
import type { LogLevel } from '@nestjs/common';

@Injectable()
export class JsonLogger extends ConsoleLogger {
  constructor(level: LogLevel) {
    super('AuthService', {
      logLevels: resolveLogLevels(level),
      timestamp: false,
    });
  }

  protected formatMessage(
    logLevel: LogLevel,
    message: unknown,
    pidMessage: string,
    formattedLogLevel: string,
    contextMessage: string,
    timestampDiff: string,
  ): string {
    void pidMessage;
    void formattedLogLevel;
    void timestampDiff;

    return `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: logLevel,
      service: 'mucyora-auth',
      context: contextMessage.trim() || undefined,
      message: sanitizeLogValue(message),
    })}\n`;
  }
}

function resolveLogLevels(level: LogLevel): LogLevel[] {
  const order: LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];
  return order.slice(0, order.indexOf(level) + 1);
}

function sanitizeLogValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
    };
  }

  if (typeof value === 'string') {
    return value.replace(
      /(password|token|secret|authorization|database_url)([=:])([^&\s]+)/gi,
      '$1=[REDACTED]',
    );
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeLogValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        isSensitiveKey(key) ? '[REDACTED]' : sanitizeLogValue(nestedValue),
      ]),
    );
  }

  return value;
}

function isSensitiveKey(key: string): boolean {
  return /password|token|secret|authorization|cookie|database.?url|nid|biometric/i.test(
    key,
  );
}
