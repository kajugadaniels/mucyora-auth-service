/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { ConfigService } from '@nestjs/config';
import { UserAccountStatus } from '@mucyora/db';

import { DatabaseService } from '../../common/database/database.service';
import { IdentityEncryptionService } from '../../common/security/identity-encryption.service';
import { KeyedDigestService } from '../../common/security/keyed-digest.service';
import { TokenService } from '../../common/security/token.service';
import { AuthEnvironment } from '../../config/environment.validation';
import { AccountCreationRateLimiter } from '../registration/account-creation-rate-limiter.service';
import { EmailVerificationService } from './email-verification.service';

const context = {
  correlationId: 'correlation-1',
  ipAddress: '127.0.0.1',
};

describe('EmailVerificationService', () => {
  it('atomically consumes a token, activates the account, and enqueues welcome mail', async () => {
    const transaction = verificationTransaction(1);
    const database = {
      $transaction: jest.fn((callback) =>
        Promise.resolve(callback(transaction)),
      ),
    } as unknown as DatabaseService;
    const service = createService(database);

    await expect(
      service.verify({ token: 'A'.repeat(43) }, context),
    ).resolves.toEqual({
      status: 'verified',
      nextAction: 'IDENTITY_VERIFICATION',
    });
    expect(transaction.user.updateMany.mock.calls).toHaveLength(1);
    expect(transaction.outboxEvent.create.mock.calls[0][0]).toMatchObject({
      data: {
        eventType: 'WELCOME_NEXT_STEP',
        payload: { recipient: 'user@example.com' },
      },
    });
  });

  it('allows only one concurrent token consumption', async () => {
    const firstTransaction = verificationTransaction(1);
    const secondTransaction = verificationTransaction(0);
    const database = {
      $transaction: jest
        .fn()
        .mockImplementationOnce((callback) =>
          Promise.resolve(callback(firstTransaction)),
        )
        .mockImplementationOnce((callback) =>
          Promise.resolve(callback(secondTransaction)),
        ),
    } as unknown as DatabaseService;
    const service = createService(database);

    await expect(
      service.verify({ token: 'A'.repeat(43) }, context),
    ).resolves.toMatchObject({ status: 'verified' });
    await expect(
      service.verify({ token: 'A'.repeat(43) }, context),
    ).rejects.toThrow('invalid or unavailable');
  });

  it('uses the same resend response for unknown and pending emails', async () => {
    const transaction = {
      emailVerificationToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'token-2' }),
      },
      outboxEvent: { create: jest.fn().mockResolvedValue({ id: 'outbox-1' }) },
      authSecurityEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-1' }),
      },
    };
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'user-1',
        emailNormalized: 'user@example.com',
        emailVerifiedAt: null,
        accountStatus: UserAccountStatus.PENDING_EMAIL_VERIFICATION,
      });
    const database = {
      user: { findUnique },
      $transaction: jest.fn((callback) =>
        Promise.resolve(callback(transaction)),
      ),
    } as unknown as DatabaseService;
    const service = createService(database);

    const unknown = await service.resend(
      { email: 'unknown@example.com' },
      context,
    );
    const pending = await service.resend(
      { email: 'user@example.com' },
      context,
    );

    expect(unknown).toEqual({ status: 'accepted' });
    expect(pending).toEqual(unknown);
    expect(transaction.emailVerificationToken.updateMany).toHaveBeenCalled();
  });
});

function verificationTransaction(consumedCount: number) {
  return {
    emailVerificationToken: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'token-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        supersededAt: null,
        user: { emailNormalized: 'user@example.com' },
      }),
      updateMany: jest.fn().mockResolvedValue({ count: consumedCount }),
    },
    user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    authSecurityEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
    },
    outboxEvent: { create: jest.fn().mockResolvedValue({ id: 'outbox-1' }) },
  };
}

function createService(database: DatabaseService): EmailVerificationService {
  return new EmailVerificationService(
    database,
    {
      get: jest.fn().mockReturnValue(86_400),
    } as unknown as ConfigService<AuthEnvironment, true>,
    {
      digest: jest.fn().mockReturnValue('safe-token-digest'),
      generate: jest.fn().mockReturnValue({
        token: 'B'.repeat(43),
        digest: 'safe-new-digest',
      }),
    } as unknown as TokenService,
    {
      requestContext: jest.fn().mockReturnValue('safe-context-digest'),
    } as unknown as KeyedDigestService,
    {
      seal: jest.fn().mockReturnValue('encrypted-token'),
    } as unknown as IdentityEncryptionService,
    {
      assertResendAllowed: jest.fn().mockResolvedValue(undefined),
    } as unknown as AccountCreationRateLimiter,
  );
}
