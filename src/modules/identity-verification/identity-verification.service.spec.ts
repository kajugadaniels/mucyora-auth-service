/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method */
import { ConfigService } from '@nestjs/config';
import {
  ConsentType,
  IdentityVerificationStatus,
  SessionLevel,
  UserAccountStatus,
  VerificationAttemptStatus,
  VerificationMediaType,
} from '@mucyora/db';

import { DatabaseService } from '../../common/database/database.service';
import { IdentityEncryptionService } from '../../common/security/identity-encryption.service';
import { KeyedDigestService } from '../../common/security/keyed-digest.service';
import { AuthEnvironment } from '../../config/environment.validation';
import { EngineUnavailableError } from '../../integrations/engine/engine.errors';
import { EngineService } from '../../integrations/engine/engine.service';
import { VerificationStorageService } from '../../integrations/verification-storage/verification-storage.service';
import type { AccessTokenClaims } from '../auth/access-token.service';
import { IdentityVerificationService } from './identity-verification.service';
import { VerificationCleanupService } from './verification-cleanup.service';

const claims = {
  sub: 'user-1',
  sid: 'session-1',
  jti: 'token-1',
  sessionLevel: SessionLevel.LIMITED,
} as AccessTokenClaims;

const context = {
  correlationId: 'correlation-1',
  ipAddress: '127.0.0.1',
  userAgent: 'synthetic-agent',
};

describe('IdentityVerificationService', () => {
  it('enforces active NIDA-linked account and biometric consent gates', async () => {
    const transaction = attemptTransaction();
    transaction.user.findUnique.mockResolvedValue({
      emailVerifiedAt: new Date(),
      accountStatus: UserAccountStatus.ACTIVE,
      identityVerificationStatus: IdentityVerificationStatus.NOT_STARTED,
      citizenIdentity: { verifiedAt: new Date() },
      consents: [],
    });
    const service = createService({
      $transaction: jest.fn((callback) =>
        Promise.resolve(callback(transaction)),
      ),
    } as unknown as DatabaseService);

    await expect(service.createAttempt(claims, context)).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({ code: 'BIOMETRIC_CONSENT_REQUIRED' }),
    });
    expect(
      transaction.identityVerificationAttempt.create,
    ).not.toHaveBeenCalled();
  });

  it('creates an attempt with bounded account-enrollment state', async () => {
    const transaction = attemptTransaction();
    const service = createService({
      $transaction: jest.fn((callback) =>
        Promise.resolve(callback(transaction)),
      ),
    } as unknown as DatabaseService);

    await expect(service.createAttempt(claims, context)).resolves.toMatchObject(
      {
        id: 'attempt-1',
        status: VerificationAttemptStatus.MEDIA_PENDING,
        attemptNumber: 1,
      },
    );
    expect(
      transaction.identityVerificationAttempt.create.mock.calls[0][0].data,
    ).toMatchObject({
      userId: 'user-1',
      documentBindingVerified: true,
      attemptNumber: 1,
    });
  });

  it('maps Engine outages to provider unavailable instead of identity failure', async () => {
    const database = submitDatabase();
    const service = createService(database, {
      evaluate: jest.fn().mockRejectedValue(new EngineUnavailableError()),
    });

    await expect(
      service.submit(claims, 'attempt-1', context),
    ).resolves.toMatchObject({
      status: VerificationAttemptStatus.PROVIDER_UNAVAILABLE,
      reasonCode: 'PROVIDER_UNAVAILABLE',
    });
    expect(database.identityVerificationAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: VerificationAttemptStatus.PROVIDER_UNAVAILABLE,
        }),
      }),
    );
  });

  it('records a pass atomically and sends only attempt-bound references', async () => {
    const database = submitDatabase(true);
    const evaluate = jest.fn().mockResolvedValue({
      decision: 'PASS',
      policyVersion: '2026-07-01',
      faceSimilarity: 92,
      livenessConfidence: 96,
      compositeScore: 93,
      documentBindingVerified: true,
      reasonCode: 'VERIFIED',
      evaluatedAt: new Date().toISOString(),
    });
    const cleanup = {
      deleteAttemptMedia: jest.fn().mockResolvedValue(undefined),
    };
    const service = createService(database, { evaluate }, cleanup);

    await expect(
      service.submit(claims, 'attempt-1', context),
    ).resolves.toMatchObject({
      status: VerificationAttemptStatus.PASSED,
    });
    const request = evaluate.mock.calls[0][0] as Record<string, unknown>;
    expect(request).toMatchObject({
      attemptId: 'attempt-1',
      userId: 'user-1',
      idDocumentReference: 'identity-verification/attempt-1/object',
      documentBindingVerified: true,
    });
    expect(request).not.toHaveProperty('nid');
    expect(request).not.toHaveProperty('nationalId');
    const transaction = (database.$transaction as jest.Mock).mock.calls[0][0];
    expect(transaction).toBeDefined();
    expect(cleanup.deleteAttemptMedia).toHaveBeenCalledWith('attempt-1');
  });
});

function attemptTransaction() {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        emailVerifiedAt: new Date(),
        accountStatus: UserAccountStatus.ACTIVE,
        identityVerificationStatus: IdentityVerificationStatus.NOT_STARTED,
        citizenIdentity: { verifiedAt: new Date() },
        consents: [
          { id: 'consent-1', consentType: ConsentType.BIOMETRIC_PROCESSING },
        ],
      }),
      update: jest.fn().mockResolvedValue({ id: 'user-1' }),
    },
    identityVerificationAttempt: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null),
      create: jest.fn().mockResolvedValue({
        id: 'attempt-1',
        status: VerificationAttemptStatus.MEDIA_PENDING,
        attemptNumber: 1,
        policyVersion: '2026-07-01',
        retryAfter: null,
        reasonCode: null,
      }),
    },
    authSecurityEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
    },
  };
}

function submitDatabase(pass = false): DatabaseService {
  const completedAttempt = {
    id: 'attempt-1',
    status: VerificationAttemptStatus.PASSED,
    attemptNumber: 1,
    policyVersion: '2026-07-01',
    retryAfter: null,
    reasonCode: 'VERIFIED',
  };
  const transaction = {
    identityVerificationAttempt: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(completedAttempt),
    },
    user: { update: jest.fn().mockResolvedValue({ id: 'user-1' }) },
    authSecurityEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
    },
    outboxEvent: {
      create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
    },
  };
  return {
    identityVerificationAttempt: {
      findFirst: jest.fn().mockResolvedValue({
        ...completedAttempt,
        status: VerificationAttemptStatus.MEDIA_PENDING,
        livenessSessionId: 'liveness-session-1',
        documentBindingVerified: true,
        media: [
          {
            objectKeyEncryptedOrOpaqueReference: 'encrypted-reference',
            mediaType: VerificationMediaType.ID_DOCUMENT,
          },
        ],
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({
        ...completedAttempt,
        status: VerificationAttemptStatus.PROVIDER_UNAVAILABLE,
        reasonCode: 'PROVIDER_UNAVAILABLE',
      }),
    },
    $transaction: jest.fn((callback) =>
      pass
        ? Promise.resolve(callback(transaction))
        : Promise.resolve(undefined),
    ),
  } as unknown as DatabaseService;
}

function createService(
  database: DatabaseService,
  engineOverrides: Partial<EngineService> = {},
  cleanupOverrides: Partial<VerificationCleanupService> = {},
): IdentityVerificationService {
  const values: Partial<AuthEnvironment> = {
    VERIFICATION_ATTEMPT_WINDOW_HOURS: 24,
    VERIFICATION_MAX_ATTEMPTS: 3,
    VERIFICATION_POLICY_VERSION: '2026-07-01',
    VERIFICATION_RETRY_DELAY_SECONDS: 3600,
    VERIFICATION_MEDIA_RETENTION_SECONDS: 86_400,
    VERIFICATION_MEDIA_MAX_PIXELS: 20_000_000,
    AWS_S3_VERIFICATION_PREFIX: 'identity-verification/',
  };
  return new IdentityVerificationService(
    database,
    {
      get: jest.fn((key: keyof AuthEnvironment) => values[key]),
    } as unknown as ConfigService<AuthEnvironment, true>,
    {
      requestContext: jest.fn().mockReturnValue('safe-context'),
    } as unknown as KeyedDigestService,
    {
      open: jest.fn().mockReturnValue('identity-verification/attempt-1/object'),
      seal: jest.fn().mockReturnValue('encrypted-reference'),
    } as unknown as IdentityEncryptionService,
    {} as VerificationStorageService,
    engineOverrides as EngineService,
    cleanupOverrides as VerificationCleanupService,
  );
}
