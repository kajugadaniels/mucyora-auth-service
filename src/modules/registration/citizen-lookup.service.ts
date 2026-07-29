import {
  Inject,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuthSecurityEventType,
  RegistrationChallengeStatus,
  SecurityEventOutcome,
  SecurityEventSeverity,
} from '@mucyora/db';

import { DatabaseService } from '../../common/database/database.service';
import { IdentityEncryptionService } from '../../common/security/identity-encryption.service';
import { KeyedDigestService } from '../../common/security/keyed-digest.service';
import {
  normalizeEmail,
  normalizeRwandaNid,
} from '../../common/security/normalization';
import { AuthEnvironment } from '../../config/environment.validation';
import {
  CITIZEN_IDENTITY_PROVIDER,
  CitizenIdentityResult,
} from '../../integrations/citizen-api/citizen-identity-provider';
import type { CitizenIdentityProvider } from '../../integrations/citizen-api/citizen-identity-provider';
import {
  CitizenNotFoundError,
  CitizenProviderResponseError,
  CitizenProviderUnavailableError,
} from '../../integrations/citizen-api/citizen-provider.errors';
import { SecurityEventWriter } from '../security-events/security-event-writer.service';
import {
  CitizenLookupDto,
  CitizenLookupResponseDto,
} from './dto/citizen-lookup.dto';
import {
  CitizenLookupRateLimitError,
  CitizenLookupRateLimiter,
} from './citizen-lookup-rate-limiter.service';
import { RegistrationChallengeTokenService } from './registration-challenge-token.service';

const INELIGIBLE_DOCUMENT_STATUSES = new Set([
  'CANCELLED',
  'DECEASED',
  'EXPIRED',
  'INVALID',
  'REVOKED',
]);

export interface CitizenLookupRequestContext {
  correlationId: string;
  ipAddress: string;
  clientInstanceId: string;
}

@Injectable()
export class CitizenLookupService {
  constructor(
    @Inject(CITIZEN_IDENTITY_PROVIDER)
    private readonly citizenProvider: CitizenIdentityProvider,
    private readonly database: DatabaseService,
    private readonly config: ConfigService<AuthEnvironment, true>,
    private readonly digests: KeyedDigestService,
    private readonly encryption: IdentityEncryptionService,
    private readonly rateLimiter: CitizenLookupRateLimiter,
    private readonly challengeTokens: RegistrationChallengeTokenService,
    private readonly securityEvents: SecurityEventWriter,
  ) {}

  async initiate(
    input: CitizenLookupDto,
    context: CitizenLookupRequestContext,
  ): Promise<CitizenLookupResponseDto> {
    const nationalId = normalizeRwandaNid(input.nid);
    const emailNormalized = normalizeEmail(input.email);
    const identityLookupDigest = this.digests.identityLookup(nationalId);
    const ipHash = this.digests.requestContext(context.ipAddress);
    const clientHash = this.digests.requestContext(context.clientInstanceId);

    try {
      await this.rateLimiter.assertAllowed({
        ipDigest: ipHash,
        clientDigest: clientHash,
        identityDigest: identityLookupDigest,
      });
    } catch (error) {
      if (error instanceof CitizenLookupRateLimitError) {
        await this.writeDeniedEvent(
          context.correlationId,
          ipHash,
          'RATE_LIMITED',
          AuthSecurityEventType.RATE_LIMIT_EXCEEDED,
        );
        throw new HttpException(
          {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Try again later.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      throw new ServiceUnavailableException({
        code: 'RATE_LIMIT_SERVICE_UNAVAILABLE',
        message: 'Registration initiation is temporarily unavailable.',
      });
    }

    let citizen: CitizenIdentityResult;
    try {
      citizen = await this.citizenProvider.findByNationalId(nationalId, {
        correlationId: context.correlationId,
      });
    } catch (error) {
      if (
        error instanceof CitizenNotFoundError ||
        error instanceof CitizenProviderResponseError
      ) {
        await this.writeDeniedEvent(
          context.correlationId,
          ipHash,
          'CITIZEN_UNAVAILABLE',
        );
        throw this.unavailableIdentity();
      }

      if (error instanceof CitizenProviderUnavailableError) {
        await this.writeDeniedEvent(
          context.correlationId,
          ipHash,
          'PROVIDER_UNAVAILABLE',
        );
        throw new ServiceUnavailableException({
          code: 'CITIZEN_PROVIDER_UNAVAILABLE',
          message: 'Registration initiation is temporarily unavailable.',
        });
      }

      throw error;
    }

    if (INELIGIBLE_DOCUMENT_STATUSES.has(citizen.documentStatus)) {
      await this.writeDeniedEvent(
        context.correlationId,
        ipHash,
        'DOCUMENT_INELIGIBLE',
      );
      throw this.unavailableIdentity();
    }

    const snapshot = JSON.stringify({
      ...citizen,
      normalizedNationalId: nationalId,
    });
    const citizenSnapshotEncrypted = this.encryption.seal(
      snapshot,
      'citizen-snapshot',
    );
    const citizenSnapshotDigest = this.digests.citizenSnapshot(snapshot);
    const expiresAt = new Date(
      Date.now() +
        this.config.get('REGISTRATION_CHALLENGE_TTL_SECONDS', {
          infer: true,
        }) *
          1_000,
    );

    const challenge = await this.database.$transaction(async (transaction) => {
      const existingIdentity = await transaction.citizenIdentity.findUnique({
        where: { identifierLookupDigest: identityLookupDigest },
        select: { id: true },
      });

      if (existingIdentity) {
        await transaction.authSecurityEvent.create({
          data: {
            eventType: AuthSecurityEventType.REGISTRATION_CHALLENGE_CREATED,
            severity: SecurityEventSeverity.WARNING,
            outcome: SecurityEventOutcome.DENIED,
            reasonCode: 'IDENTITY_UNAVAILABLE',
            correlationId: context.correlationId,
            ipHash,
          },
          select: { id: true },
        });
        return null;
      }

      const created = await transaction.registrationChallenge.create({
        data: {
          identityLookupDigest,
          emailNormalized,
          status: RegistrationChallengeStatus.PENDING,
          citizenSnapshotEncrypted,
          citizenSnapshotDigest,
          expiresAt,
          attemptCount: 0,
          createdIpHash: ipHash,
        },
        select: { id: true, expiresAt: true },
      });

      await transaction.authSecurityEvent.create({
        data: {
          eventType: AuthSecurityEventType.REGISTRATION_CHALLENGE_CREATED,
          severity: SecurityEventSeverity.INFO,
          outcome: SecurityEventOutcome.SUCCESS,
          correlationId: context.correlationId,
          ipHash,
          safeMetadata: {
            challengeStatus: RegistrationChallengeStatus.PENDING,
          },
        },
        select: { id: true },
      });

      return created;
    });

    if (!challenge) {
      throw this.unavailableIdentity();
    }

    return {
      registrationChallengeToken: this.challengeTokens.issue(challenge.id),
      expiresAt: challenge.expiresAt.toISOString(),
      citizen: {
        surname: citizen.surname,
        givenNames: citizen.givenNames,
        dateOfBirth: citizen.dateOfBirth,
        nationality: citizen.nationality,
        sex: citizen.sex,
      },
    };
  }

  private unavailableIdentity(): UnprocessableEntityException {
    return new UnprocessableEntityException({
      code: 'REGISTRATION_INITIATION_UNAVAILABLE',
      message:
        'Registration cannot be initiated with the supplied information.',
    });
  }

  private async writeDeniedEvent(
    correlationId: string,
    ipHash: string,
    reasonCode: string,
    eventType: AuthSecurityEventType = AuthSecurityEventType.REGISTRATION_CHALLENGE_CREATED,
  ): Promise<void> {
    try {
      await this.securityEvents.write({
        eventType,
        severity: SecurityEventSeverity.WARNING,
        outcome: SecurityEventOutcome.DENIED,
        reasonCode,
        correlationId,
        ipHash,
      });
    } catch {
      // Audit failure must not expose provider or identity details.
    }
  }
}
