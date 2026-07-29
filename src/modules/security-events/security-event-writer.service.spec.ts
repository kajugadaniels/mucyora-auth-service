import {
  AuthSecurityEventType,
  SecurityEventOutcome,
  SecurityEventSeverity,
} from '@mucyora/db';
import { DatabaseService } from '../../common/database/database.service';
import { SecurityEventWriter } from './security-event-writer.service';

describe('SecurityEventWriter', () => {
  const baseEvent = {
    eventType: AuthSecurityEventType.LOGIN_FAILED,
    severity: SecurityEventSeverity.WARNING,
    outcome: SecurityEventOutcome.FAILURE,
    correlationId: 'correlation-1',
  };

  it('writes a minimized event and returns its identifier', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'event-1' });
    const database = {
      authSecurityEvent: { create },
    } as unknown as DatabaseService;

    await expect(
      new SecurityEventWriter(database).write({
        ...baseEvent,
        safeMetadata: { attemptCount: 2 },
      }),
    ).resolves.toBe('event-1');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('rejects sensitive or structured metadata', async () => {
    const database = {
      authSecurityEvent: { create: jest.fn() },
    } as unknown as DatabaseService;
    const writer = new SecurityEventWriter(database);

    await expect(
      writer.write({
        ...baseEvent,
        safeMetadata: { tokenValue: 'forbidden' },
      }),
    ).rejects.toThrow('forbidden key');
    await expect(
      writer.write({
        ...baseEvent,
        safeMetadata: { details: { nested: true } },
      }),
    ).rejects.toThrow('must be scalar');
  });
});
