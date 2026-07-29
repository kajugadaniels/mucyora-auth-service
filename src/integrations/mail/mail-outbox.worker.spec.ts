/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';

import { DatabaseService } from '../../common/database/database.service';
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
          },
        ]),
        updateMany,
      },
    } as unknown as DatabaseService;
    const send = jest.fn().mockResolvedValue(undefined);
    const redis = readyRedis();
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
      redis,
    );

    await expect(worker.dispatchBatch()).resolves.toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'outbox-1', publishedAt: null },
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
      readyRedis(),
    );

    await expect(worker.dispatchBatch()).resolves.toBe(0);
    expect(updateMany.mock.calls[0][0]).toMatchObject({
      data: { lastError: 'MAIL_DELIVERY_FAILED' },
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
      readyRedis(),
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

function readyRedis(): Redis {
  return {
    status: 'ready',
    set: jest.fn().mockResolvedValue('OK'),
    eval: jest.fn().mockResolvedValue(1),
  } as unknown as Redis;
}

function workerConfig(): ConfigService<AuthEnvironment, true> {
  const values: Partial<AuthEnvironment> = {
    CACHE_PREFIX: 'mucyora:auth:',
    OUTBOX_BATCH_SIZE: 20,
  };
  return {
    get: jest.fn((key: keyof AuthEnvironment) => values[key]),
  } as unknown as ConfigService<AuthEnvironment, true>;
}
