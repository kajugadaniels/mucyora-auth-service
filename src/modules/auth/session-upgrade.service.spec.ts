/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ConfigService } from '@nestjs/config';
import {
  IdentityVerificationStatus,
  SessionLevel,
  SessionStatus,
  UserAccountStatus,
} from '@mucyora/db';

import { DatabaseService } from '../../common/database/database.service';
import { IdentityEncryptionService } from '../../common/security/identity-encryption.service';
import { KeyedDigestService } from '../../common/security/keyed-digest.service';
import { TokenService } from '../../common/security/token.service';
import { AuthEnvironment } from '../../config/environment.validation';
import { AccessTokenService } from './access-token.service';
import { TokenTransport } from './dto/auth.dto';
import { SessionUpgradeService } from './session-upgrade.service';

describe('SessionUpgradeService', () => {
  it('atomically revokes the limited family and issues one full session', async () => {
    const fixture = createFixture();
    const issued = await fixture.service.upgrade(
      claims(),
      input(),
      'upgrade-request-0001',
      requestContext(),
    );

    expect(fixture.tx.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: SessionStatus.ACTIVE }),
      }),
    );
    expect(fixture.tx.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: 'limited-1', revokedAt: null },
      }),
    );
    expect(fixture.tx.authSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sessionLevel: SessionLevel.FULL }),
      }),
    );
    expect(issued.response).toMatchObject({
      sessionLevel: SessionLevel.FULL,
      identityVerified: true,
      refreshToken: 'raw-refresh',
    });
  });

  it('cannot use another user verification attempt', async () => {
    const fixture = createFixture({ validAttempt: false });

    await expect(
      fixture.service.upgrade(
        claims(),
        input(),
        'upgrade-request-0002',
        requestContext(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(fixture.tx.authSession.create).not.toHaveBeenCalled();
  });

  it('returns the completed result without creating another session', async () => {
    const fixture = createFixture({ completedReplay: true });

    const issued = await fixture.service.upgrade(
      claims(),
      input(),
      'upgrade-request-0003',
      requestContext(),
    );

    expect(fixture.tx.authSession.create).not.toHaveBeenCalled();
    expect(issued.refreshToken).toBe('raw-refresh');
  });

  it('does not issue credentials when the transaction rolls back', async () => {
    const fixture = createFixture({ transactionFailure: true });

    await expect(
      fixture.service.upgrade(
        claims(),
        input(),
        'upgrade-request-0004',
        requestContext(),
      ),
    ).rejects.toThrow('transaction rolled back');
    expect(fixture.accessTokens.issue).not.toHaveBeenCalled();
  });

  it('allows only one winner when concurrent requests race', async () => {
    let available = true;
    const first = createFixture({
      updateCount: () => {
        if (!available) return 0;
        available = false;
        return 1;
      },
    });
    const second = createFixture({
      updateCount: () => {
        if (!available) return 0;
        available = false;
        return 1;
      },
    });

    const results = await Promise.allSettled([
      first.service.upgrade(
        claims(),
        input(),
        'concurrent-key-01',
        requestContext(),
      ),
      second.service.upgrade(
        claims(),
        input(),
        'concurrent-key-02',
        requestContext(),
      ),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
  });
});

function createFixture(
  options: {
    validAttempt?: boolean;
    completedReplay?: boolean;
    transactionFailure?: boolean;
    updateCount?: () => number;
  } = {},
) {
  const result = JSON.stringify({
    userId: 'user-1',
    sessionId: 'full-1',
    refreshToken: 'raw-refresh',
    transport: TokenTransport.NATIVE,
  });
  const tx = {
    idempotencyRecord: {
      findUnique: jest.fn().mockResolvedValue(
        options.completedReplay
          ? {
              requestDigest: 'request-digest',
              status: 'COMPLETED',
              responseReference: 'sealed-result',
              expiresAt: new Date(Date.now() + 60_000),
            }
          : null,
      ),
      create: jest.fn(),
      update: jest.fn(),
    },
    authSession: {
      findUnique: jest.fn().mockResolvedValue({
        userId: 'user-1',
        status: SessionStatus.ACTIVE,
        sessionLevel: SessionLevel.LIMITED,
        expiresAt: new Date(Date.now() + 60_000),
        deviceId: 'device-1',
        deviceLabel: 'Phone',
        ipHash: 'ip',
        userAgentHash: 'agent',
        user: {
          accountStatus: UserAccountStatus.ACTIVE,
          identityVerificationStatus: IdentityVerificationStatus.VERIFIED,
        },
      }),
      updateMany: jest.fn().mockImplementation(() => ({
        count: options.updateCount?.() ?? 1,
      })),
      create: jest.fn().mockResolvedValue({ id: 'full-1' }),
    },
    identityVerificationAttempt: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.validAttempt === false ? null : { id: 'attempt-1' },
        ),
    },
    refreshToken: { updateMany: jest.fn(), create: jest.fn() },
    authSecurityEvent: { create: jest.fn() },
  };
  const database = {
    $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) => {
      const value = await callback(tx);
      if (options.transactionFailure)
        throw new Error('transaction rolled back');
      return value;
    }),
    authSession: {
      findFirst: jest.fn().mockResolvedValue({ id: 'full-1' }),
    },
  };
  const accessTokens = {
    issue: jest.fn().mockReturnValue({ token: 'access', expiresIn: 900 }),
  };
  const service = new SessionUpgradeService(
    database as unknown as DatabaseService,
    {
      get: jest.fn((key: keyof AuthEnvironment) =>
        key === 'SESSION_UPGRADE_IDEMPOTENCY_TTL_SECONDS' ? 900 : 2_592_000,
      ),
    } as unknown as ConfigService<AuthEnvironment, true>,
    {
      generate: jest.fn().mockReturnValue({
        token: 'raw-refresh',
        digest: 'refresh-digest',
      }),
    } as unknown as TokenService,
    {
      requestContext: jest.fn().mockReturnValue('request-digest'),
    } as unknown as KeyedDigestService,
    {
      seal: jest.fn().mockReturnValue('sealed-result'),
      open: jest.fn().mockReturnValue(result),
    } as unknown as IdentityEncryptionService,
    accessTokens as unknown as AccessTokenService,
  );
  return { service, tx, accessTokens };
}

function claims() {
  return {
    sub: 'user-1',
    sid: 'limited-1',
    sessionLevel: SessionLevel.LIMITED,
  } as Parameters<SessionUpgradeService['upgrade']>[0];
}

function input() {
  return {
    verificationAttemptId: 'attempt-1',
    transport: TokenTransport.NATIVE,
  };
}

function requestContext() {
  return {
    correlationId: 'correlation-1',
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
  };
}
