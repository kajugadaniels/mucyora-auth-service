import { timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuthSecurityEventType,
  ConsentType,
  IdentitySource,
  IdentityType,
  IdempotencyStatus,
  Prisma,
  RegistrationChallengeStatus,
  SecurityEventOutcome,
  SecurityEventSeverity,
  UserAccountStatus,
} from '@mucyora/db';
import Joi from 'joi';

import { DatabaseService } from '../../common/database/database.service';
import { IdentityEncryptionService } from '../../common/security/identity-encryption.service';
import { KeyedDigestService } from '../../common/security/keyed-digest.service';
import { maskIdentifier } from '../../common/security/masking';
import { normalizeEmail } from '../../common/security/normalization';
import { PasswordPolicyService } from '../../common/security/password-policy.service';
import { TokenService } from '../../common/security/token.service';
import { AuthEnvironment } from '../../config/environment.validation';
import {
  AccountCreationRateLimitError,
  AccountCreationRateLimiter,
} from './account-creation-rate-limiter.service';
import {
  RegistrationDto,
  RegistrationResponseDto,
} from './dto/registration.dto';
import { RegistrationChallengeLifecycleService } from './registration-challenge-lifecycle.service';
import { RegistrationChallengeTokenService } from './registration-challenge-token.service';

const REQUIRED_CONSENTS = new Set<ConsentType>([
  ConsentType.BIOMETRIC_PROCESSING,
  ConsentType.IDENTITY_DATA_PROCESSING,
  ConsentType.PRIVACY_POLICY,
  ConsentType.TERMS_OF_SERVICE,
]);

const citizenSnapshotSchema = Joi.object({
  normalizedNationalId: Joi.string()
    .pattern(/^\d{16}$/)
    .required(),
  providerReference: Joi.string().max(200).allow(null).required(),
  nationality: Joi.string().max(100).required(),
  surname: Joi.string().max(200).required(),
  givenNames: Joi.string().max(300).required(),
  dateOfBirth: Joi.string().isoDate().required(),
  sex: Joi.string().max(32).required(),
  documentStatus: Joi.string().max(64).required(),
  portraitReference: Joi.string().max(500).allow(null).required(),
  sourceUpdatedAt: Joi.string().isoDate().allow(null).required(),
})
  .unknown(false)
  .required();

interface RegistrationSnapshot {
  normalizedNationalId: string;
  providerReference: string | null;
  nationality: string;
  surname: string;
  givenNames: string;
  dateOfBirth: string;
  sex: string;
}

export interface RegistrationRequestContext {
  correlationId: string;
  ipAddress: string;
  idempotencyKey: string;
}

@Injectable()
export class RegistrationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService<AuthEnvironment, true>,
    private readonly encryption: IdentityEncryptionService,
    private readonly digests: KeyedDigestService,
    private readonly tokens: TokenService,
    private readonly passwords: PasswordPolicyService,
    private readonly rateLimiter: AccountCreationRateLimiter,
    private readonly challengeTokens: RegistrationChallengeTokenService,
    private readonly challengeLifecycle: RegistrationChallengeLifecycleService,
  ) {}

  async register(
    input: RegistrationDto,
    context: RegistrationRequestContext,
  ): Promise<RegistrationResponseDto> {
    const challengeId = this.challengeTokens.resolve(
      input.registrationChallengeToken,
    );
    const emailNormalized = normalizeEmail(input.email);
    this.assertRequiredConsents(input);
    const idempotencyScope = 'registration:create';
    const requestDigest = this.digests.requestContext(
      JSON.stringify({
        challenge: input.registrationChallengeToken,
        email: emailNormalized,
        password: input.password,
        consents: input.consents,
      }),
    );
    const existingIdempotency =
      await this.database.idempotencyRecord.findUnique({
        where: {
          scope_key: {
            scope: idempotencyScope,
            key: context.idempotencyKey,
          },
        },
        select: {
          requestDigest: true,
          status: true,
          responseReference: true,
        },
      });
    if (existingIdempotency) {
      return this.resolveIdempotentReplay(existingIdempotency, requestDigest);
    }

    const challenge = await this.database.registrationChallenge.findUnique({
      where: { id: challengeId },
      select: {
        id: true,
        identityLookupDigest: true,
        emailNormalized: true,
        status: true,
        citizenSnapshotEncrypted: true,
        citizenSnapshotDigest: true,
        expiresAt: true,
        consumedAt: true,
      },
    });

    if (
      !challenge ||
      challenge.status !== RegistrationChallengeStatus.PENDING ||
      challenge.consumedAt ||
      challenge.expiresAt.getTime() <= Date.now() ||
      challenge.emailNormalized !== emailNormalized
    ) {
      throw this.invalidChallenge();
    }

    const snapshotPlaintext = this.encryption.open(
      challenge.citizenSnapshotEncrypted,
      'citizen-snapshot',
    );
    if (
      !constantTimeTextEqual(
        this.digests.citizenSnapshot(snapshotPlaintext),
        challenge.citizenSnapshotDigest,
      )
    ) {
      throw this.invalidChallenge();
    }
    const snapshot = this.parseSnapshot(snapshotPlaintext);
    const expectedIdentityDigest = this.digests.identityLookup(
      snapshot.normalizedNationalId,
    );
    if (
      !constantTimeTextEqual(
        expectedIdentityDigest,
        challenge.identityLookupDigest,
      )
    ) {
      throw this.invalidChallenge();
    }

    const ipHash = this.digests.requestContext(context.ipAddress);
    try {
      await this.rateLimiter.assertRegistrationAllowed(
        ipHash,
        challenge.identityLookupDigest,
      );
    } catch (error) {
      if (error instanceof AccountCreationRateLimitError) {
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
        message: 'Registration is temporarily unavailable.',
      });
    }

    const passwordHash = await this.passwords.hash(
      input.password,
      emailNormalized,
    );
    const emailToken = this.tokens.generate(32);
    const encryptedEmailToken = this.encryption.seal(
      emailToken.token,
      'email-verification-token',
    );
    const now = new Date();
    const emailTokenExpiresAt = new Date(
      now.getTime() +
        this.config.get('EMAIL_TOKEN_TTL_SECONDS', { infer: true }) * 1_000,
    );
    const encryptedIdentifier = this.encryption.seal(
      snapshot.normalizedNationalId,
      'rwanda-nid',
    );

    try {
      const user = await this.database.$transaction(async (transaction) => {
        const idempotency = await transaction.idempotencyRecord.create({
          data: {
            scope: idempotencyScope,
            key: context.idempotencyKey,
            requestDigest,
            status: IdempotencyStatus.IN_PROGRESS,
            expiresAt: new Date(now.getTime() + 86_400_000),
          },
          select: { id: true },
        });
        const attemptRecorded = await this.challengeLifecycle.recordAttempt(
          transaction,
          challenge.id,
          now,
        );
        if (!attemptRecorded) {
          throw this.invalidChallenge();
        }

        const [emailOwner, identityOwner] = await Promise.all([
          transaction.user.findUnique({
            where: { emailNormalized },
            select: { id: true },
          }),
          transaction.citizenIdentity.findUnique({
            where: {
              identifierLookupDigest: challenge.identityLookupDigest,
            },
            select: { id: true },
          }),
        ]);
        if (emailOwner || identityOwner) {
          throw new ConflictException({
            code: 'REGISTRATION_UNAVAILABLE',
            message: 'Registration could not be completed.',
          });
        }

        const createdUser = await transaction.user.create({
          data: {
            email: emailNormalized,
            emailNormalized,
            accountStatus: UserAccountStatus.PENDING_EMAIL_VERIFICATION,
          },
          select: { id: true, emailNormalized: true },
        });

        await transaction.userCredential.create({
          data: {
            userId: createdUser.id,
            passwordHash,
            passwordAlgorithm: 'argon2id-v19',
            passwordChangedAt: now,
          },
        });
        await transaction.citizenIdentity.create({
          data: {
            userId: createdUser.id,
            identityType: IdentityType.NID,
            nidEncrypted: encryptedIdentifier,
            encryptedIdentifier,
            identifierLookupDigest: challenge.identityLookupDigest,
            maskedIdentifier: maskIdentifier(snapshot.normalizedNationalId),
            encryptionVersion: this.config.get(
              'IDENTITY_ENCRYPTION_KEY_VERSION',
              { infer: true },
            ),
            lookupKeyVersion: this.config.get('IDENTITY_LOOKUP_KEY_VERSION', {
              infer: true,
            }),
            source: IdentitySource.NIDA,
            sourceReference: snapshot.providerReference,
            verifiedAt: now,
            surName: snapshot.surname,
            postNames: snapshot.givenNames,
            sex: snapshot.sex,
            dateOfBirth: new Date(`${snapshot.dateOfBirth}T00:00:00.000Z`),
            countryOfBirth: snapshot.nationality,
          },
        });
        await transaction.userConsent.createMany({
          data: input.consents.map((consent) => ({
            userId: createdUser.id,
            consentType: consent.type,
            policyVersion: consent.policyVersion,
            grantedAt: now,
            evidence: {
              capture: 'registration-api',
            },
          })),
        });
        await transaction.emailVerificationToken.create({
          data: {
            userId: createdUser.id,
            tokenDigest: emailToken.digest,
            expiresAt: emailTokenExpiresAt,
          },
        });

        const consumed = await this.challengeLifecycle.consume(
          transaction,
          challenge.id,
          now,
        );
        if (!consumed) {
          throw this.invalidChallenge();
        }

        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'USER',
            aggregateId: createdUser.id,
            eventType: 'EMAIL_VERIFICATION_REQUESTED',
            payload: {
              recipient: createdUser.emailNormalized,
              tokenEncrypted: encryptedEmailToken,
            },
          },
        });
        await transaction.authSecurityEvent.create({
          data: {
            userId: createdUser.id,
            eventType: AuthSecurityEventType.REGISTRATION_COMPLETED,
            severity: SecurityEventSeverity.INFO,
            outcome: SecurityEventOutcome.SUCCESS,
            correlationId: context.correlationId,
            ipHash,
          },
        });
        await transaction.idempotencyRecord.update({
          where: { id: idempotency.id },
          data: {
            status: IdempotencyStatus.COMPLETED,
            responseReference: createdUser.id,
          },
        });

        return createdUser;
      });

      return buildRegistrationResponse(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'REGISTRATION_UNAVAILABLE',
          message: 'Registration could not be completed.',
        });
      }
      throw error;
    }
  }

  private async resolveIdempotentReplay(
    record: {
      requestDigest: string;
      status: IdempotencyStatus;
      responseReference: string | null;
    },
    requestDigest: string,
  ): Promise<RegistrationResponseDto> {
    if (
      !constantTimeTextEqual(record.requestDigest, requestDigest) ||
      record.status !== IdempotencyStatus.COMPLETED ||
      !record.responseReference
    ) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'The idempotency key cannot be used for this request.',
      });
    }

    const user = await this.database.user.findUnique({
      where: { id: record.responseReference },
      select: { id: true, emailNormalized: true },
    });
    if (!user) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'The idempotency key cannot be used for this request.',
      });
    }
    return buildRegistrationResponse(user);
  }

  private assertRequiredConsents(input: RegistrationDto): void {
    const supplied = new Set(input.consents.map((consent) => consent.type));
    if (
      supplied.size !== REQUIRED_CONSENTS.size ||
      [...REQUIRED_CONSENTS].some((consent) => !supplied.has(consent))
    ) {
      throw new BadRequestException({
        code: 'CONSENT_SET_INVALID',
        message: 'All required consent policies must be accepted.',
      });
    }
  }

  private parseSnapshot(value: string): RegistrationSnapshot {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw this.invalidChallenge();
    }
    const validation = citizenSnapshotSchema.validate(parsed, {
      abortEarly: false,
      convert: false,
    });
    if (validation.error) {
      throw this.invalidChallenge();
    }
    return validation.value as RegistrationSnapshot;
  }

  private invalidChallenge(): BadRequestException {
    return new BadRequestException({
      code: 'REGISTRATION_CHALLENGE_INVALID',
      message: 'The registration challenge is invalid or unavailable.',
    });
  }
}

function constantTimeTextEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  const visible = localPart.slice(0, Math.min(2, localPart.length));
  return `${visible}${'*'.repeat(Math.max(1, localPart.length - visible.length))}@${domain}`;
}

function buildRegistrationResponse(user: {
  id: string;
  emailNormalized: string;
}): RegistrationResponseDto {
  return {
    userReference: user.id,
    maskedEmail: maskEmail(user.emailNormalized),
    emailVerificationRequired: true,
    identityVerificationRequired: true,
    nextAction: 'VERIFY_EMAIL',
  };
}
