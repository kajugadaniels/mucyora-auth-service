/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method */
import { ConfigService } from '@nestjs/config';
import {
  IdentityVerificationStatus,
  SessionLevel,
  SessionStatus,
  UserAccountStatus,
} from '@mucyora/db';
import type Redis from 'ioredis';

import { DatabaseService } from '../../common/database/database.service';
import { KeyedDigestService } from '../../common/security/keyed-digest.service';
import { PasswordPolicyService } from '../../common/security/password-policy.service';
import { TokenService } from '../../common/security/token.service';
import { AuthEnvironment } from '../../config/environment.validation';
import { SecurityEventWriter } from '../security-events/security-event-writer.service';
import { AccessTokenService } from './access-token.service';
import { AuthRateLimiter } from './auth-rate-limiter.service';
import { AuthenticationService } from './authentication.service';
import { TokenTransport } from './dto/auth.dto';

const context = {
  correlationId: 'correlation-1',
  ipAddress: '127.0.0.1',
  userAgent: 'synthetic-agent',
};

describe('AuthenticationService', () => {
  it('returns the same generic error for unknown email and wrong password', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(loginUser(IdentityVerificationStatus.NOT_STARTED));
    const database = {
      user: { findUnique },
      $transaction: jest.fn(),
    } as unknown as DatabaseService;
    const passwords = {
      verifyDummy: jest.fn().mockResolvedValue(undefined),
      verify: jest.fn().mockResolvedValue(false),
    };
    const service = createService(database, passwords);

    const unknown = await captureError(
      service.login(loginInput('unknown@example.com'), context),
    );
    const wrong = await captureError(
      service.login(loginInput('user@example.com'), context),
    );

    expect(unknown.getStatus()).toBe(401);
    expect(wrong.getResponse()).toEqual(unknown.getResponse());
    expect(passwords.verifyDummy).toHaveBeenCalled();
    expect(passwords.verify).toHaveBeenCalled();
  });

  it.each([
    [IdentityVerificationStatus.NOT_STARTED, SessionLevel.LIMITED],
    [IdentityVerificationStatus.VERIFIED, SessionLevel.FULL],
  ])(
    'issues the correct session gate for %s',
    async (identityStatus, level) => {
      const transaction = loginTransaction();
      const database = {
        user: {
          findUnique: jest.fn().mockResolvedValue(loginUser(identityStatus)),
        },
        $transaction: jest.fn((callback) =>
          Promise.resolve(callback(transaction)),
        ),
      } as unknown as DatabaseService;
      const service = createService(database, {
        verify: jest.fn().mockResolvedValue(true),
        needsRehash: jest.fn().mockReturnValue(false),
      });

      const issued = await service.login(
        loginInput('user@example.com'),
        context,
      );

      expect(issued.response.sessionLevel).toBe(level);
      expect(
        transaction.refreshToken.create.mock.calls[0][0].data,
      ).toMatchObject({
        tokenDigest: 'safe-refresh-digest',
        generation: 0,
      });
      expect(
        JSON.stringify(transaction.refreshToken.create.mock.calls),
      ).not.toContain('raw-refresh-token');
    },
  );

  it('rotates the indexed refresh digest and links generations atomically', async () => {
    const transaction = refreshTransaction();
    const database = {
      refreshToken: {
        findUnique: jest.fn().mockResolvedValue(activeRefresh()),
      },
      $transaction: jest.fn((callback) =>
        Promise.resolve(callback(transaction)),
      ),
    } as unknown as DatabaseService;
    const service = createService(database);

    const issued = await service.refresh(
      'presented-refresh-token',
      TokenTransport.NATIVE,
      context,
    );

    expect(issued.response.refreshToken).toBe('raw-refresh-token');
    expect(transaction.refreshToken.create.mock.calls[0][0].data).toMatchObject(
      {
        tokenDigest: 'safe-refresh-digest',
        generation: 2,
      },
    );
    expect(
      transaction.refreshToken.updateMany.mock.calls[0][0].data,
    ).toHaveProperty('replacedByTokenId', 'replacement-1');
  });

  it('revokes the correct session family when reuse is outside grace', async () => {
    const transaction = reuseTransaction();
    const database = {
      refreshToken: {
        findUnique: jest.fn().mockResolvedValue({
          ...activeRefresh(),
          usedAt: new Date(Date.now() - 60_000),
        }),
      },
      $transaction: jest.fn((callback) =>
        Promise.resolve(callback(transaction)),
      ),
    } as unknown as DatabaseService;
    const service = createService(database);

    await expect(
      service.refresh(
        'presented-refresh-token',
        TokenTransport.NATIVE,
        context,
      ),
    ).rejects.toThrow('invalid or unavailable');
    expect(transaction.authSession.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'session-1' },
      data: { status: SessionStatus.COMPROMISED },
    });
    expect(transaction.refreshToken.updateMany.mock.calls[0][0]).toMatchObject({
      where: { sessionId: 'session-1' },
    });
  });

  it('does not mark a family compromised for a concurrent replay inside grace', async () => {
    const database = {
      refreshToken: {
        findUnique: jest.fn().mockResolvedValue({
          ...activeRefresh(),
          usedAt: new Date(),
        }),
      },
      $transaction: jest.fn(),
    } as unknown as DatabaseService;
    const service = createService(database);

    await expect(
      service.refresh(
        'presented-refresh-token',
        TokenTransport.NATIVE,
        context,
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'REFRESH_ALREADY_ROTATED' }),
    });
    expect(database.$transaction).not.toHaveBeenCalled();
  });
});

function loginInput(email: string) {
  return {
    email,
    password: 'synthetic-password',
    deviceId: 'device-instance-0001',
    transport: TokenTransport.NATIVE,
  };
}

function loginUser(identityVerificationStatus: IdentityVerificationStatus) {
  return {
    id: 'user-1',
    emailVerifiedAt: new Date(),
    accountStatus: UserAccountStatus.ACTIVE,
    identityVerificationStatus,
    credential: {
      id: 'credential-1',
      passwordHash: '$argon2id$safe',
      failedLoginCount: 0,
      lockedUntil: null,
    },
  };
}

function loginTransaction() {
  return {
    authSession: {
      create: jest.fn().mockResolvedValue({ id: 'session-1' }),
    },
    refreshToken: {
      create: jest.fn().mockResolvedValue({ id: 'refresh-1' }),
    },
    userCredential: {
      update: jest.fn().mockResolvedValue({ id: 'credential-1' }),
    },
    authSecurityEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
    },
  };
}

function activeRefresh() {
  return {
    id: 'refresh-1',
    userId: 'user-1',
    sessionId: 'session-1',
    generation: 1,
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    revokedAt: null,
    session: {
      id: 'session-1',
      userId: 'user-1',
      sessionLevel: SessionLevel.FULL,
      status: SessionStatus.ACTIVE,
      expiresAt: new Date(Date.now() + 60_000),
    },
  };
}

function refreshTransaction() {
  return {
    refreshToken: {
      create: jest.fn().mockResolvedValue({ id: 'replacement-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    authSession: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    authSecurityEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
    },
  };
}

function reuseTransaction() {
  return {
    refreshToken: {
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      update: jest.fn().mockResolvedValue({ id: 'refresh-1' }),
    },
    authSession: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    authSecurityEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
    },
  };
}

function createService(
  database: DatabaseService,
  passwordOverrides: Partial<PasswordPolicyService> = {},
): AuthenticationService {
  const values: Partial<AuthEnvironment> = {
    REFRESH_TOKEN_TTL_SECONDS: 2_592_000,
    LOGIN_LOCK_THRESHOLD: 10,
    LOGIN_LOCK_SECONDS: 900,
    CACHE_PREFIX: 'mucyora:auth:',
    REFRESH_REPLAY_GRACE_SECONDS: 10,
  };
  return new AuthenticationService(
    database,
    {
      get: jest.fn((key: keyof AuthEnvironment) => values[key]),
    } as unknown as ConfigService<AuthEnvironment, true>,
    {
      verifyDummy: jest.fn().mockResolvedValue(undefined),
      verify: jest.fn().mockResolvedValue(true),
      needsRehash: jest.fn().mockReturnValue(false),
      hash: jest.fn(),
      ...passwordOverrides,
    } as unknown as PasswordPolicyService,
    {
      generate: jest.fn().mockReturnValue({
        token: 'raw-refresh-token',
        digest: 'safe-refresh-digest',
      }),
      digest: jest.fn().mockReturnValue('presented-safe-digest'),
    } as unknown as TokenService,
    {
      requestContext: jest.fn().mockReturnValue('safe-context-digest'),
    } as unknown as KeyedDigestService,
    {
      issue: jest.fn().mockReturnValue({
        token: 'signed-access-token',
        expiresIn: 900,
      }),
    } as unknown as AccessTokenService,
    {
      assertLoginAllowed: jest.fn().mockResolvedValue(undefined),
      assertRefreshAllowed: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRateLimiter,
    {
      write: jest.fn().mockResolvedValue('event-1'),
    } as unknown as SecurityEventWriter,
    {
      status: 'ready',
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockResolvedValue(1),
    } as unknown as Redis,
  );
}

async function captureError(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'getStatus' in error &&
      'getResponse' in error
    ) {
      return error as {
        getStatus(): number;
        getResponse(): unknown;
      };
    }
    throw error;
  }
  throw new Error('Expected authentication failure');
}
