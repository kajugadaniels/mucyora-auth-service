/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { ConfigService } from '@nestjs/config';

import { DatabaseService } from '../../common/database/database.service';
import { DistributedJobLockService } from '../../common/operations/distributed-job-lock.service';
import { IdentityEncryptionService } from '../../common/security/identity-encryption.service';
import { AuthEnvironment } from '../../config/environment.validation';
import { MailOutboxWorker } from './mail-outbox.worker';
import { MailTemplateService } from './mail-template.service';

describe('MailOutboxWorker', () => {
  it('decrypts the token only in memory and publishes after mail succeeds', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const database = {
      outboxEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'outbox-1',
            eventType: 'EMAIL_VERIFICATION_REQUESTED',
            payload: {
              recipient: 'user@example.com',
              tokenEncrypted: 'encrypted-token',
            },
            attemptCount: 0,
          },
        ]),
        updateMany,
      },
    } as unknown as DatabaseService;
    const send = jest.fn().mockResolvedValue(undefined);
    const worker = new MailOutboxWorker(
      database,
      workerConfig(),
      {
        open: jest.fn().mockReturnValue('raw-token-in-memory'),
      } as unknown as IdentityEncryptionService,
      {
        emailVerification: jest.fn().mockReturnValue({
          recipient: 'user@example.com',
          subject: 'Verify',
          text: 'Safe',
          html: '<p>Safe</p>',
        }),
      } as unknown as MailTemplateService,
      { send },
      immediateLock(),
    );

    await expect(worker.dispatchBatch()).resolves.toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(updateMany.mock.calls[1][0]).toMatchObject({
      where: {
        id: 'outbox-1',
        publishedAt: null,
        processingBy: expect.any(String),
      },
      data: { lastError: null },
    });
  });

  it('records a safe failure without throwing into account workflows', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const database = {
      outboxEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'outbox-1',
            eventType: 'WELCOME_NEXT_STEP',
            payload: { recipient: 'user@example.com' },
            attemptCount: 9,
          },
        ]),
        updateMany,
      },
    } as unknown as DatabaseService;
    const worker = new MailOutboxWorker(
      database,
      workerConfig(),
      {} as IdentityEncryptionService,
      {
        welcome: jest.fn().mockReturnValue({
          recipient: 'user@example.com',
          subject: 'Welcome',
          text: 'Safe',
          html: '<p>Safe</p>',
        }),
      } as unknown as MailTemplateService,
      {
        send: jest.fn().mockRejectedValue(new Error('provider secret')),
      },
      immediateLock(),
    );

    await expect(worker.dispatchBatch()).resolves.toBe(0);
    expect(updateMany.mock.calls[1][0]).toMatchObject({
      data: {
        lastError: 'MAIL_DELIVERY_FAILED',
        deadLetteredAt: expect.any(Date),
        nextAttemptAt: expect.any(Date),
      },
    });
  });

  it('decrypts password reset tokens with a purpose-bound envelope', async () => {
    const open = jest.fn().mockReturnValue('raw-reset-token');
    const passwordReset = jest.fn().mockReturnValue({
      recipient: 'user@example.com',
      subject: 'Reset',
      text: 'Safe',
      html: '<p>Safe</p>',
    });
    const database = {
      outboxEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'outbox-reset',
            eventType: 'PASSWORD_RESET_REQUESTED',
            payload: {
              recipient: 'user@example.com',
              tokenEncrypted: 'encrypted-reset-token',
            },
            attemptCount: 0,
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as DatabaseService;
    const worker = new MailOutboxWorker(
      database,
      workerConfig(),
      { open } as unknown as IdentityEncryptionService,
      { passwordReset } as unknown as MailTemplateService,
      { send: jest.fn().mockResolvedValue(undefined) },
      immediateLock(),
    );

    await expect(worker.dispatchBatch()).resolves.toBe(1);
    expect(open).toHaveBeenCalledWith(
      'encrypted-reset-token',
      'password-reset-token',
    );
    expect(passwordReset).toHaveBeenCalledWith(
      'user@example.com',
      'raw-reset-token',
    );
  });
});

function immediateLock(): DistributedJobLockService {
  return {
    runExclusive: jest.fn(
      async (_name: string, _ttl: number, work: () => Promise<unknown>) =>
        work(),
    ),
  } as unknown as DistributedJobLockService;
}

function workerConfig(): ConfigService<AuthEnvironment, true> {
  const values: Partial<AuthEnvironment> = {
    CACHE_PREFIX: 'mucyora:auth:',
    OUTBOX_BATCH_SIZE: 20,
    OUTBOX_DELIVERY_CONCURRENCY: 4,
    OUTBOX_MAX_ATTEMPTS: 10,
    OUTBOX_LEASE_SECONDS: 120,
    OUTBOX_RETRY_BASE_SECONDS: 30,
    OUTBOX_RETRY_MAX_SECONDS: 3_600,
    OPERATIONAL_JOB_LOCK_TTL_SECONDS: 240,
  };
  return {
    get: jest.fn((key: keyof AuthEnvironment) => values[key]),
  } as unknown as ConfigService<AuthEnvironment, true>;
}
