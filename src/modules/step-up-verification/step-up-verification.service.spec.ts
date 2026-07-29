/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ConfigService } from '@nestjs/config';
import {
  StepUpChallengeStatus,
  VerificationAttemptStatus,
  VerificationPurpose,
} from '@mucyora/db';

import { DatabaseService } from '../../common/database/database.service';
import { IdentityEncryptionService } from '../../common/security/identity-encryption.service';
import { KeyedDigestService } from '../../common/security/keyed-digest.service';
import { TokenService } from '../../common/security/token.service';
import { AuthEnvironment } from '../../config/environment.validation';
import { StepUpVerificationService } from './step-up-verification.service';

describe('StepUpVerificationService', () => {
  it('issues a short-lived assertion only after the linked attempt passes', async () => {
    const fixture = createFixture();

    const result = await fixture.service.issueAssertion(
      claims(),
      'challenge-1',
      context(),
    );

    expect(result.assertion).toBe('raw-assertion');
    expect(fixture.database.$transaction).toHaveBeenCalled();
    expect(fixture.tx.stepUpChallenge.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: StepUpChallengeStatus.PENDING,
        }),
        data: expect.objectContaining({
          assertionDigest: 'assertion-digest',
          status: StepUpChallengeStatus.VERIFIED,
        }),
      }),
    );
  });

  it('rejects a target mismatch without consuming the assertion', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.consumeAssertion('mucyora-user', {
        assertion: 'raw-assertion',
        userId: '11111111-1111-4111-8111-111111111111',
        purpose: VerificationPurpose.DEVICE_TRANSFER,
        targetResourceId: 'different-device',
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(fixture.database.stepUpChallenge.updateMany).toHaveBeenCalledTimes(
      1,
    );
  });

  it('prevents a service from consuming another purpose', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.consumeAssertion('mucyora-signature', {
        assertion: 'raw-assertion',
        userId: '11111111-1111-4111-8111-111111111111',
        purpose: VerificationPurpose.DEVICE_TRANSFER,
        targetResourceId: 'device-1',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('atomically consumes an assertion once', async () => {
    const fixture = createFixture();
    const result = await fixture.service.consumeAssertion('mucyora-user', {
      assertion: 'raw-assertion',
      userId: '11111111-1111-4111-8111-111111111111',
      purpose: VerificationPurpose.DEVICE_TRANSFER,
      targetResourceId: 'device-1',
    });

    expect(result).toMatchObject({
      verified: true,
      purpose: VerificationPurpose.DEVICE_TRANSFER,
    });
    expect(
      fixture.database.stepUpChallenge.updateMany,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: StepUpChallengeStatus.CONSUMED,
          consumedByService: 'mucyora-user',
          assertionEncrypted: null,
        }),
      }),
    );
  });

  it('rejects a replay when the conditional consume loses', async () => {
    const fixture = createFixture({ consumeCount: 0 });

    await expect(
      fixture.service.consumeAssertion('mucyora-user', {
        assertion: 'raw-assertion',
        userId: '11111111-1111-4111-8111-111111111111',
        purpose: VerificationPurpose.DEVICE_TRANSFER,
        targetResourceId: 'device-1',
      }),
    ).rejects.toMatchObject({ status: 401 });
  });
});

function createFixture(options: { consumeCount?: number } = {}) {
  const tx = {
    stepUpChallenge: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    authSecurityEvent: { create: jest.fn() },
  };
  const database = {
    $transaction: jest.fn((callback: (value: typeof tx) => unknown) =>
      callback(tx),
    ),
    stepUpChallenge: {
      updateMany: jest
        .fn()
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValue({ count: options.consumeCount ?? 1 }),
      findFirst: jest.fn().mockResolvedValue({
        id: 'challenge-1',
        purpose: VerificationPurpose.DEVICE_TRANSFER,
        status: StepUpChallengeStatus.PENDING,
        assertionEncrypted: null,
        assertionExpiresAt: null,
        expiresAt: new Date(Date.now() + 600_000),
        verificationAttempt: { status: VerificationAttemptStatus.PASSED },
      }),
      findUnique: jest.fn().mockResolvedValue({
        id: 'challenge-1',
        userId: '11111111-1111-4111-8111-111111111111',
        purpose: VerificationPurpose.DEVICE_TRANSFER,
        targetResourceDigest: 'DEVICE_TRANSFER:device-1',
        status: StepUpChallengeStatus.VERIFIED,
        assertionExpiresAt: new Date(Date.now() + 60_000),
        verificationAttemptId: 'attempt-1',
        verifiedAt: new Date(),
      }),
    },
  };
  const service = new StepUpVerificationService(
    database as unknown as DatabaseService,
    {
      get: jest.fn((key: keyof AuthEnvironment) =>
        key === 'STEP_UP_ASSERTION_TTL_SECONDS' ? 300 : 600,
      ),
    } as unknown as ConfigService<AuthEnvironment, true>,
    {
      requestContext: jest.fn((value: string) => value),
    } as unknown as KeyedDigestService,
    {
      generate: jest.fn().mockReturnValue({
        token: 'raw-assertion',
        digest: 'assertion-digest',
      }),
      digest: jest.fn().mockReturnValue('assertion-digest'),
    } as unknown as TokenService,
    {
      seal: jest.fn().mockReturnValue('encrypted-assertion'),
      open: jest.fn().mockReturnValue('raw-assertion'),
    } as unknown as IdentityEncryptionService,
  );
  return { service, database, tx };
}

function claims() {
  return {
    sub: '11111111-1111-4111-8111-111111111111',
    sid: 'session-1',
  } as Parameters<StepUpVerificationService['issueAssertion']>[0];
}

function context() {
  return {
    correlationId: 'correlation-1',
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
  };
}
