import { Injectable } from '@nestjs/common';
import {
  AuthSecurityEventType,
  Prisma,
  SecurityEventOutcome,
  SecurityEventSeverity,
} from '@mucyora/db';
import { DatabaseService } from '../../common/database/database.service';

export interface WriteSecurityEventInput {
  userId?: string;
  sessionId?: string;
  eventType: AuthSecurityEventType;
  severity: SecurityEventSeverity;
  outcome: SecurityEventOutcome;
  reasonCode?: string;
  correlationId: string;
  ipHash?: string;
  userAgentHash?: string;
  safeMetadata?: Readonly<Record<string, unknown>>;
}

@Injectable()
export class SecurityEventWriter {
  constructor(private readonly database: DatabaseService) {}

  async write(input: WriteSecurityEventInput): Promise<string> {
    const event = await this.database.authSecurityEvent.create({
      data: {
        userId: input.userId,
        sessionId: input.sessionId,
        eventType: input.eventType,
        severity: input.severity,
        outcome: input.outcome,
        reasonCode: input.reasonCode,
        correlationId: input.correlationId,
        ipHash: input.ipHash,
        userAgentHash: input.userAgentHash,
        safeMetadata: sanitizeMetadata(input.safeMetadata),
      },
      select: { id: true },
    });

    return event.id;
  }
}

function sanitizeMetadata(
  metadata?: Readonly<Record<string, unknown>>,
): Prisma.InputJsonObject | undefined {
  if (!metadata) {
    return undefined;
  }

  const entries = Object.entries(metadata);
  if (entries.length > 20) {
    throw new RangeError('Security event metadata has too many fields.');
  }

  return Object.fromEntries(
    entries.map(([key, value]) => {
      if (
        !/^[a-z][A-Za-z0-9]{0,63}$/.test(key) ||
        /password|token|secret|authorization|cookie|nid|identity|biometric/i.test(
          key,
        )
      ) {
        throw new RangeError(
          'Security event metadata contains a forbidden key.',
        );
      }

      if (
        value !== null &&
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean'
      ) {
        throw new RangeError('Security event metadata values must be scalar.');
      }

      if (typeof value === 'string' && value.length > 256) {
        throw new RangeError('Security event metadata value is too long.');
      }

      return [key, value] as const;
    }),
  );
}
