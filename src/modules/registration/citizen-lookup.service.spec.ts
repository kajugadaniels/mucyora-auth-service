import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RegistrationChallengeStatus, SecurityEventOutcome } from '@mucyora/db';

import { DatabaseService } from '../../common/database/database.service';
import { IdentityEncryptionService } from '../../common/security/identity-encryption.service';
import { KeyedDigestService } from '../../common/security/keyed-digest.service';
import { AuthEnvironment } from '../../config/environment.validation';
import type { CitizenIdentityProvider } from '../../integrations/citizen-api/citizen-identity-provider';
import { CitizenNotFoundError } from '../../integrations/citizen-api/citizen-provider.errors';
import { SecurityEventWriter } from '../security-events/security-event-writer.service';
import {
  CitizenLookupRateLimitError,
  CitizenLookupRateLimiter,
} from './citizen-lookup-rate-limiter.service';
import { CitizenLookupService } from './citizen-lookup.service';
import { RegistrationChallengeTokenService } from './registration-challenge-token.service';

const nationalId = '1000000000000001';
const citizen = {
  providerReference: 'provider-private',
  nationality: 'Rwanda',
  surname: 'Mucyo',
  givenNames: 'Ora',
  dateOfBirth: '1998-12-31',
  sex: 'F',
  documentStatus: 'ACTIVE',
  portraitReference: 'private-portrait',
  sourceUpdatedAt: null,
};
const context = {
  correlationId: 'correlation-1',
  ipAddress: '127.0.0.1',
  clientInstanceId: 'client-instance-0001',
};

describe('CitizenLookupService', () => {
  let provider: jest.Mocked<CitizenIdentityProvider>;
  let rateLimiter: { assertAllowed: jest.Mock };
  let transaction: {
    citizenIdentity: { findUnique: jest.Mock };
    registrationChallenge: { create: jest.Mock };
    authSecurityEvent: { create: jest.Mock };
  };
  let database: { $transaction: jest.Mock };
  let encryption: { seal: jest.Mock };
  let securityEvents: { write: jest.Mock };
  let service: CitizenLookupService;

  beforeEach(() => {
    provider = {
      findByNationalId: jest.fn().mockResolvedValue(citizen),
    };
    rateLimiter = {
      assertAllowed: jest.fn().mockResolvedValue(undefined),
    };
    transaction = {
      citizenIdentity: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      registrationChallenge: {
        create: jest.fn().mockResolvedValue({
          id: '123e4567-e89b-42d3-a456-426614174000',
          expiresAt: new Date('2026-07-29T20:10:00.000Z'),
        }),
      },
      authSecurityEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-1' }),
      },
    };
    database = {
      $transaction: jest.fn(
        (callback: (value: typeof transaction) => unknown) =>
          Promise.resolve(callback(transaction)),
      ),
    };
    encryption = {
      seal: jest.fn().mockReturnValue('encrypted-minimal-snapshot'),
    };
    securityEvents = {
      write: jest.fn().mockResolvedValue('event-1'),
    };

    service = new CitizenLookupService(
      provider,
      database as unknown as DatabaseService,
      configService(),
      {
        identityLookup: jest.fn().mockReturnValue('v1:safe-identity-digest'),
        requestContext: jest.fn((value: string) =>
          value === '127.0.0.1' ? 'safe-ip-digest' : `safe-${value.length}`,
        ),
        citizenSnapshot: jest.fn().mockReturnValue('safe-snapshot-digest'),
      } as unknown as KeyedDigestService,
      encryption as unknown as IdentityEncryptionService,
      rateLimiter as unknown as CitizenLookupRateLimiter,
      {
        issue: jest.fn().mockReturnValue('mrc1.opaque-token'),
      } as unknown as RegistrationChallengeTokenService,
      securityEvents as unknown as SecurityEventWriter,
    );
  });

  it('creates an encrypted short-lived challenge after the provider call', async () => {
    const response = await service.initiate(
      { nid: '1000-0000 0000-0001', email: ' User@Example.COM ' },
      context,
    );

    expect(provider.findByNationalId.mock.calls[0][0]).toBe(nationalId);
    expect(provider.findByNationalId.mock.invocationCallOrder[0]).toBeLessThan(
      database.$transaction.mock.invocationCallOrder[0],
    );
    expect(response).toEqual({
      registrationChallengeToken: 'mrc1.opaque-token',
      expiresAt: '2026-07-29T20:10:00.000Z',
      citizen: {
        surname: 'Mucyo',
        givenNames: 'Ora',
        dateOfBirth: '1998-12-31',
        nationality: 'Rwanda',
        sex: 'F',
      },
    });
    expect(JSON.stringify(response)).not.toContain(nationalId);
    expect(JSON.stringify(response)).not.toContain('provider-private');
    expect(JSON.stringify(response)).not.toContain('private-portrait');
    expect(encryption.seal).toHaveBeenCalledWith(
      JSON.stringify(citizen),
      'citizen-snapshot',
    );
    const challengeCreateCalls = transaction.registrationChallenge.create.mock
      .calls as unknown[][];
    expect(challengeCreateCalls[0][0]).toMatchObject({
      data: {
        identityLookupDigest: 'v1:safe-identity-digest',
        emailNormalized: 'user@example.com',
        status: RegistrationChallengeStatus.PENDING,
        citizenSnapshotEncrypted: 'encrypted-minimal-snapshot',
        attemptCount: 0,
        createdIpHash: 'safe-ip-digest',
      },
    });
    const auditCreateCalls = transaction.authSecurityEvent.create.mock
      .calls as Array<Array<{ data: { outcome: SecurityEventOutcome } }>>;
    expect(auditCreateCalls[0][0].data.outcome).toBe(
      SecurityEventOutcome.SUCCESS,
    );
  });

  it('returns the same external error for missing and registered identities', async () => {
    provider.findByNationalId.mockRejectedValueOnce(new CitizenNotFoundError());
    const missing = await captureHttpError(
      service.initiate({ nid: nationalId, email: 'user@example.com' }, context),
    );

    provider.findByNationalId.mockResolvedValueOnce(citizen);
    transaction.citizenIdentity.findUnique.mockResolvedValueOnce({
      id: 'identity-1',
    });
    const registered = await captureHttpError(
      service.initiate({ nid: nationalId, email: 'user@example.com' }, context),
    );

    expect(missing.getStatus()).toBe(422);
    expect(registered.getStatus()).toBe(422);
    expect(missing.getResponse()).toEqual(registered.getResponse());
  });

  it('stops before NIDA when a distributed rate dimension is exceeded', async () => {
    rateLimiter.assertAllowed.mockRejectedValue(
      new CitizenLookupRateLimitError(),
    );

    const error = await captureHttpError(
      service.initiate({ nid: nationalId, email: 'user@example.com' }, context),
    );

    expect(error.getStatus()).toBe(429);
    expect(provider.findByNationalId.mock.calls).toHaveLength(0);
    expect(securityEvents.write).toHaveBeenCalled();
  });

  it('rejects explicitly ineligible document status without a transaction', async () => {
    provider.findByNationalId.mockResolvedValue({
      ...citizen,
      documentStatus: 'REVOKED',
    });

    const error = await captureHttpError(
      service.initiate({ nid: nationalId, email: 'user@example.com' }, context),
    );

    expect(error.getStatus()).toBe(422);
    expect(database.$transaction).not.toHaveBeenCalled();
  });
});

function configService(): ConfigService<AuthEnvironment, true> {
  return {
    get: jest.fn((key: keyof AuthEnvironment) => {
      if (key === 'REGISTRATION_CHALLENGE_TTL_SECONDS') return 600;
      throw new Error(`Unexpected config key: ${key}`);
    }),
  } as unknown as ConfigService<AuthEnvironment, true>;
}

async function captureHttpError(
  promise: Promise<unknown>,
): Promise<HttpException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpException) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected request to fail');
}
