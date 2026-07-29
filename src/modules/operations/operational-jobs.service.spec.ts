/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ConfigService } from '@nestjs/config';
import { SessionStatus } from '@mucyora/db';

import { DatabaseService } from '../../common/database/database.service';
import { DistributedJobLockService } from '../../common/operations/distributed-job-lock.service';
import { AuthEnvironment } from '../../config/environment.validation';
import { OperationalJobsService } from './operational-jobs.service';

describe('OperationalJobsService', () => {
  it('uses bounded batches and atomically expires sessions with refresh tokens', async () => {
    const fixture = createFixture();
    fixture.database.authSession.findMany.mockResolvedValueOnce([
      { id: 'session-1' },
    ]);

    const result = await fixture.service.runCycle();

    expect(result.sessionsExpired).toBe(1);
    expect(fixture.database.authSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 25 }),
    );
    expect(fixture.transaction.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: SessionStatus.EXPIRED }),
      }),
    );
    expect(fixture.transaction.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: { in: ['session-1'] }, revokedAt: null },
      }),
    );
  });

  it('excludes active legal holds from security-event retention', async () => {
    const fixture = createFixture();

    await fixture.service.runCycle();

    expect(fixture.database.authSecurityEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { legalHoldUntil: null },
            { legalHoldUntil: { lte: expect.any(Date) } },
          ],
        }),
        take: 25,
      }),
    );
  });

  it('publishes minimized failure status without leaking exception details', async () => {
    const fixture = createFixture();
    fixture.database.emailVerificationToken.findMany.mockRejectedValue(
      new Error('database credentials and secret'),
    );

    await expect(fixture.service.runCycle()).resolves.toEqual({});
    expect(fixture.service.status()).toMatchObject({
      running: false,
      lastErrorCode: 'OPERATIONAL_CYCLE_FAILED',
    });
    expect(JSON.stringify(fixture.service.status())).not.toContain(
      'database credentials',
    );
  });
});

function createFixture() {
  const delegate = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  });
  const transaction = {
    authSession: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    identityVerificationAttempt: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    verificationMedia: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const database = {
    emailVerificationToken: delegate(),
    passwordResetRequest: delegate(),
    passwordResetToken: delegate(),
    idempotencyRecord: delegate(),
    refreshToken: delegate(),
    authSession: delegate(),
    identityVerificationAttempt: delegate(),
    verificationMedia: delegate(),
    authSecurityEvent: delegate(),
    stepUpChallenge: delegate(),
    outboxEvent: {
      count: jest.fn().mockResolvedValue(0),
    },
    $transaction: jest.fn(
      (callback: (value: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };
  const values: Partial<AuthEnvironment> = {
    OPERATIONAL_JOB_LOCK_TTL_SECONDS: 240,
    OPERATIONAL_JOB_BATCH_SIZE: 25,
    TOKEN_RETENTION_DAYS: 7,
    SESSION_RETENTION_DAYS: 30,
    SECURITY_EVENT_RETENTION_DAYS: 365,
    STALE_VERIFICATION_ATTEMPT_HOURS: 24,
  };
  const service = new OperationalJobsService(
    database as unknown as DatabaseService,
    {
      get: jest.fn((key: keyof AuthEnvironment) => values[key]),
    } as unknown as ConfigService<AuthEnvironment, true>,
    {
      runExclusive: jest.fn(
        async (_name: string, _ttl: number, work: () => Promise<unknown>) =>
          work(),
      ),
    } as unknown as DistributedJobLockService,
  );
  return { service, database, transaction };
}
