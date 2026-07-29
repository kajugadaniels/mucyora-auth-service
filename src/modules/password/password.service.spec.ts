/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method */
import { ConfigService } from '@nestjs/config';
import { SessionLevel, SessionStatus, UserAccountStatus } from '@mucyora/db';

import { DatabaseService } from '../../common/database/database.service';
import { IdentityEncryptionService } from '../../common/security/identity-encryption.service';
import { KeyedDigestService } from '../../common/security/keyed-digest.service';
import { PasswordPolicyService } from '../../common/security/password-policy.service';
import { TokenService } from '../../common/security/token.service';
import { AuthEnvironment } from '../../config/environment.validation';
import type { AccessTokenClaims } from '../auth/access-token.service';
import { PasswordRateLimiter } from './password-rate-limiter.service';
import { PasswordService } from './password.service';

const context = {
  correlationId: 'correlation-1',
  ipAddress: '127.0.0.1',
  userAgent: 'synthetic-agent',
};

const claims = {
  sub: 'user-1',
  sid: 'session-1',
  jti: 'token-1',
  sessionLevel: SessionLevel.FULL,
} as AccessTokenClaims;

describe('PasswordService', () => {
  it('returns the same generic forgot response for absent and eligible accounts', async () => {
    const transaction = forgotTransaction();
    const database = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(activeUser()),
      },
      $transaction: jest.fn((callback) =>
        Promise.resolve(callback(transaction)),
      ),
    } as unknown as DatabaseService;
    const service = createService(database);

    const absent = await service.forgot(
      { email: 'absent@example.com' },
      context,
    );
    const existing = await service.forgot(
      { email: 'user@example.com' },
      context,
    );

    expect(absent).toEqual({ status: 'accepted' });
    expect(existing).toEqual(absent);
    expect(
      transaction.passwordResetRequest.create.mock.calls[0][0].data,
    ).toMatchObject({
      tokenDigest: 'generated-token-digest',
      requestedIpHash: 'safe-context-digest',
    });
    expect(
      JSON.stringify(transaction.passwordResetRequest.create.mock.calls),
    ).not.toContain('raw-reset-token');
  });

  it('consumes a reset once and revokes sessions and refresh tokens atomically', async () => {
    const transaction = passwordTransaction();
    const database = {
      passwordResetRequest: {
        findUnique: jest.fn().mockResolvedValue(activeResetRequest()),
      },
      $transaction: jest.fn((callback) =>
        Promise.resolve(callback(transaction)),
      ),
    } as unknown as DatabaseService;
    const service = createService(database);

    await expect(
      service.reset(
        {
          token: 'A'.repeat(43),
          newPassword: 'A different secure voyage phrase 47!',
        },
        context,
      ),
    ).resolves.toEqual({ status: 'changed' });

    expect(
      transaction.passwordResetRequest.updateMany.mock.calls[0][0],
    ).toMatchObject({
      where: { id: 'reset-1', usedAt: null, revokedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(transaction.authSession.updateMany.mock.calls[0][0]).toMatchObject({
      where: { userId: 'user-1', status: SessionStatus.ACTIVE },
      data: { status: SessionStatus.REVOKED },
    });
    expect(transaction.refreshToken.updateMany.mock.calls[0][0]).toMatchObject({
      where: { userId: 'user-1', revokedAt: null },
    });
  });

  it('rejects a concurrent second reset without changing the credential', async () => {
    const transaction = passwordTransaction();
    transaction.passwordResetRequest.updateMany
      .mockReset()
      .mockResolvedValue({ count: 0 });
    const database = {
      passwordResetRequest: {
        findUnique: jest.fn().mockResolvedValue(activeResetRequest()),
      },
      $transaction: jest.fn((callback) =>
        Promise.resolve(callback(transaction)),
      ),
    } as unknown as DatabaseService;
    const service = createService(database);

    await expect(
      service.reset(
        {
          token: 'A'.repeat(43),
          newPassword: 'A different secure voyage phrase 47!',
        },
        context,
      ),
    ).rejects.toMatchObject({
      status: 400,
      response: expect.objectContaining({ code: 'PASSWORD_RESET_INVALID' }),
    });
    expect(transaction.userCredential.update).not.toHaveBeenCalled();
  });

  it('requires the current password before an authenticated change', async () => {
    const database = {
      userCredential: {
        findUnique: jest.fn().mockResolvedValue(activeCredential()),
      },
      $transaction: jest.fn(),
    } as unknown as DatabaseService;
    const service = createService(database, {
      verify: jest.fn().mockResolvedValue(false),
    });

    await expect(
      service.change(
        claims,
        {
          currentPassword: 'wrong-password',
          newPassword: 'A different secure voyage phrase 47!',
        },
        context,
      ),
    ).rejects.toMatchObject({
      status: 401,
      response: expect.objectContaining({ code: 'CURRENT_PASSWORD_INVALID' }),
    });
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it('changes the password with a compare-and-set and revokes every session', async () => {
    const transaction = passwordTransaction();
    const database = {
      userCredential: {
        findUnique: jest.fn().mockResolvedValue(activeCredential()),
      },
      $transaction: jest.fn((callback) =>
        Promise.resolve(callback(transaction)),
      ),
    } as unknown as DatabaseService;
    const verify = jest
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const service = createService(database, { verify });

    await expect(
      service.change(
        claims,
        {
          currentPassword: 'current-password',
          newPassword: 'A different secure voyage phrase 47!',
        },
        context,
      ),
    ).resolves.toEqual({ status: 'changed' });

    expect(
      transaction.userCredential.updateMany.mock.calls[0][0],
    ).toMatchObject({
      where: { userId: 'user-1', passwordHash: 'current-hash' },
      data: { passwordAlgorithm: 'argon2id' },
    });
    expect(transaction.authSession.updateMany).toHaveBeenCalled();
    expect(transaction.outboxEvent.create.mock.calls[0][0].data).toMatchObject({
      eventType: 'PASSWORD_CHANGED_NOTIFICATION',
    });
  });
});

function activeUser() {
  return {
    id: 'user-1',
    emailNormalized: 'user@example.com',
    emailVerifiedAt: new Date(),
    accountStatus: UserAccountStatus.ACTIVE,
  };
}

function activeCredential() {
  return {
    passwordHash: 'current-hash',
    user: {
      emailNormalized: 'user@example.com',
      accountStatus: UserAccountStatus.ACTIVE,
    },
  };
}

function activeResetRequest() {
  return {
    id: 'reset-1',
    userId: 'user-1',
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    revokedAt: null,
    user: {
      emailNormalized: 'user@example.com',
      accountStatus: UserAccountStatus.ACTIVE,
    },
  };
}

function forgotTransaction() {
  return {
    passwordResetRequest: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({ id: 'reset-1' }),
    },
    outboxEvent: {
      create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
    },
    authSecurityEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
    },
  };
}

function passwordTransaction() {
  return {
    passwordResetRequest: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    userCredential: {
      update: jest.fn().mockResolvedValue({ id: 'credential-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    authSession: {
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    refreshToken: {
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    outboxEvent: {
      create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
    },
    authSecurityEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
    },
  };
}

function createService(
  database: DatabaseService,
  passwordOverrides: Partial<PasswordPolicyService> = {},
): PasswordService {
  const values: Partial<AuthEnvironment> = {
    PASSWORD_RESET_TOKEN_TTL_SECONDS: 900,
  };
  return new PasswordService(
    database,
    {
      get: jest.fn((key: keyof AuthEnvironment) => values[key]),
    } as unknown as ConfigService<AuthEnvironment, true>,
    {
      generate: jest.fn().mockReturnValue({
        token: 'raw-reset-token',
        digest: 'generated-token-digest',
      }),
      digest: jest.fn().mockReturnValue('presented-token-digest'),
    } as unknown as TokenService,
    {
      requestContext: jest.fn().mockReturnValue('safe-context-digest'),
    } as unknown as KeyedDigestService,
    {
      seal: jest.fn().mockReturnValue('encrypted-reset-token'),
    } as unknown as IdentityEncryptionService,
    {
      verify: jest.fn().mockResolvedValue(true),
      hash: jest.fn().mockResolvedValue('new-password-hash'),
      ...passwordOverrides,
    } as unknown as PasswordPolicyService,
    {
      assertResetRequestAllowed: jest.fn().mockResolvedValue(undefined),
      assertResetAllowed: jest.fn().mockResolvedValue(undefined),
      assertChangeAllowed: jest.fn().mockResolvedValue(undefined),
    } as unknown as PasswordRateLimiter,
  );
}
