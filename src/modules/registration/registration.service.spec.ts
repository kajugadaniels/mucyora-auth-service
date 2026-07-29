/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { ConfigService } from '@nestjs/config';
import {
  ConsentType,
  IdempotencyStatus,
  RegistrationChallengeStatus,
} from '@mucyora/db';

import { DatabaseService } from '../../common/database/database.service';
import { IdentityEncryptionService } from '../../common/security/identity-encryption.service';
import { KeyedDigestService } from '../../common/security/keyed-digest.service';
import { PasswordPolicyService } from '../../common/security/password-policy.service';
import { TokenService } from '../../common/security/token.service';
import { AuthEnvironment } from '../../config/environment.validation';
import { AccountCreationRateLimiter } from './account-creation-rate-limiter.service';
import { RegistrationChallengeLifecycleService } from './registration-challenge-lifecycle.service';
import { RegistrationChallengeTokenService } from './registration-challenge-token.service';
import { RegistrationService } from './registration.service';

const nationalId = '1000000000000001';
const snapshot = JSON.stringify({
  normalizedNationalId: nationalId,
  providerReference: 'provider-reference',
  nationality: 'Rwanda',
  surname: 'Mucyo',
  givenNames: 'Ora',
  dateOfBirth: '1998-12-31',
  sex: 'F',
  documentStatus: 'ACTIVE',
  portraitReference: null,
  sourceUpdatedAt: null,
});
const registrationInput = {
  registrationChallengeToken: `mrc1.${'A'.repeat(100)}`,
  email: 'user@example.com',
  password: 'Maple river lantern voyage 47!',
  consents: [
    {
      type: ConsentType.TERMS_OF_SERVICE,
      policyVersion: '2026-07-01',
    },
    {
      type: ConsentType.PRIVACY_POLICY,
      policyVersion: '2026-07-01',
    },
    {
      type: ConsentType.IDENTITY_DATA_PROCESSING,
      policyVersion: '2026-07-01',
    },
    {
      type: ConsentType.BIOMETRIC_PROCESSING,
      policyVersion: '2026-07-01',
    },
  ],
};

describe('RegistrationService', () => {
  it('creates all registration records in one short transaction', async () => {
    const transaction = registrationTransaction();
    const database = {
      idempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      registrationChallenge: {
        findUnique: jest.fn().mockResolvedValue(activeChallenge()),
      },
      $transaction: jest.fn((callback) =>
        Promise.resolve(callback(transaction)),
      ),
    } as unknown as DatabaseService;
    const service = createService(database);

    const response = await service.register(registrationInput, {
      correlationId: 'correlation-1',
      ipAddress: '127.0.0.1',
      idempotencyKey: 'registration-request-0001',
    });

    expect(response).toMatchObject({
      userReference: 'user-1',
      maskedEmail: 'us**@example.com',
      emailVerificationRequired: true,
      identityVerificationRequired: true,
      nextAction: 'VERIFY_EMAIL',
    });
    expect(transaction.user.create.mock.calls).toHaveLength(1);
    expect(transaction.userCredential.create.mock.calls).toHaveLength(1);
    expect(transaction.citizenIdentity.create.mock.calls).toHaveLength(1);
    expect(
      transaction.userConsent.createMany.mock.calls[0][0].data,
    ).toHaveLength(4);
    expect(
      transaction.emailVerificationToken.create.mock.calls[0][0],
    ).toMatchObject({
      data: { tokenDigest: 'safe-email-token-digest' },
    });
    const outboxPayload =
      transaction.outboxEvent.create.mock.calls[0][0].data.payload;
    expect(outboxPayload).toEqual({
      recipient: 'user@example.com',
      tokenEncrypted: 'encrypted-email-token',
    });
    expect(JSON.stringify(outboxPayload)).not.toContain('raw-email-token');
  });

  it('returns no success when any atomic registration write fails', async () => {
    const transaction = registrationTransaction();
    transaction.userConsent.createMany.mockRejectedValue(
      new Error('synthetic transaction failure'),
    );
    const database = {
      idempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      registrationChallenge: {
        findUnique: jest.fn().mockResolvedValue(activeChallenge()),
      },
      $transaction: jest.fn((callback) =>
        Promise.resolve(callback(transaction)),
      ),
    } as unknown as DatabaseService;
    const service = createService(database);

    await expect(
      service.register(registrationInput, {
        correlationId: 'correlation-1',
        ipAddress: '127.0.0.1',
        idempotencyKey: 'registration-request-0001',
      }),
    ).rejects.toThrow('synthetic transaction failure');
    expect(transaction.outboxEvent.create.mock.calls).toHaveLength(0);
  });

  it('returns a completed idempotent replay without consuming the challenge again', async () => {
    const challengeFind = jest.fn();
    const transactionCall = jest.fn();
    const database = {
      idempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue({
          requestDigest: 'safe-request-digest',
          status: IdempotencyStatus.COMPLETED,
          responseReference: 'user-1',
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          emailNormalized: 'user@example.com',
        }),
      },
      registrationChallenge: {
        findUnique: challengeFind,
      },
      $transaction: transactionCall,
    } as unknown as DatabaseService;
    const service = createService(database, 'safe-request-digest');

    await expect(
      service.register(registrationInput, {
        correlationId: 'correlation-1',
        ipAddress: '127.0.0.1',
        idempotencyKey: 'registration-request-0001',
      }),
    ).resolves.toMatchObject({
      userReference: 'user-1',
      nextAction: 'VERIFY_EMAIL',
    });
    expect(challengeFind).not.toHaveBeenCalled();
    expect(transactionCall).not.toHaveBeenCalled();
  });
});

function activeChallenge() {
  return {
    id: '123e4567-e89b-42d3-a456-426614174000',
    identityLookupDigest: 'v1:safe-identity-digest',
    emailNormalized: 'user@example.com',
    status: RegistrationChallengeStatus.PENDING,
    citizenSnapshotEncrypted: 'encrypted-snapshot',
    citizenSnapshotDigest: 'safe-snapshot-digest',
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
  };
}

function registrationTransaction() {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'user-1',
        emailNormalized: 'user@example.com',
      }),
    },
    citizenIdentity: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'identity-1' }),
    },
    userCredential: {
      create: jest.fn().mockResolvedValue({ id: 'credential-1' }),
    },
    userConsent: {
      createMany: jest.fn().mockResolvedValue({ count: 4 }),
    },
    emailVerificationToken: {
      create: jest.fn().mockResolvedValue({ id: 'email-token-1' }),
    },
    outboxEvent: {
      create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
    },
    authSecurityEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
    },
    idempotencyRecord: {
      create: jest.fn().mockResolvedValue({ id: 'idempotency-1' }),
      update: jest.fn().mockResolvedValue({ id: 'idempotency-1' }),
    },
  };
}

function createService(
  database: DatabaseService,
  requestDigest = 'safe-ip-digest',
): RegistrationService {
  return new RegistrationService(
    database,
    {
      get: jest.fn((key: keyof AuthEnvironment) => {
        const values: Partial<AuthEnvironment> = {
          EMAIL_TOKEN_TTL_SECONDS: 86_400,
          IDENTITY_ENCRYPTION_KEY_VERSION: 'v1',
          IDENTITY_LOOKUP_KEY_VERSION: 'v1',
        };
        return values[key];
      }),
    } as unknown as ConfigService<AuthEnvironment, true>,
    {
      open: jest.fn().mockReturnValue(snapshot),
      seal: jest.fn((value: string, purpose: string) =>
        purpose === 'email-verification-token'
          ? 'encrypted-email-token'
          : `encrypted-${value.length}`,
      ),
    } as unknown as IdentityEncryptionService,
    {
      citizenSnapshot: jest.fn().mockReturnValue('safe-snapshot-digest'),
      identityLookup: jest.fn().mockReturnValue('v1:safe-identity-digest'),
      requestContext: jest.fn().mockReturnValue(requestDigest),
    } as unknown as KeyedDigestService,
    {
      generate: jest.fn().mockReturnValue({
        token: 'raw-email-token',
        digest: 'safe-email-token-digest',
      }),
    } as unknown as TokenService,
    {
      hash: jest.fn().mockResolvedValue('$argon2id$safe-hash'),
    } as unknown as PasswordPolicyService,
    {
      assertRegistrationAllowed: jest.fn().mockResolvedValue(undefined),
    } as unknown as AccountCreationRateLimiter,
    {
      resolve: jest
        .fn()
        .mockReturnValue('123e4567-e89b-42d3-a456-426614174000'),
    } as unknown as RegistrationChallengeTokenService,
    {
      recordAttempt: jest.fn().mockResolvedValue(true),
      consume: jest.fn().mockResolvedValue(true),
    } as unknown as RegistrationChallengeLifecycleService,
  );
}
