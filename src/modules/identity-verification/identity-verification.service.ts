import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuthSecurityEventType,
  ConsentType,
  IdentityVerificationStatus,
  Prisma,
  SecurityEventOutcome,
  SecurityEventSeverity,
  UserAccountStatus,
  VerificationAttemptStatus,
  VerificationMediaType,
  VerificationPurpose,
} from '@mucyora/db';

import { DatabaseService } from '../../common/database/database.service';
import { IdentityEncryptionService } from '../../common/security/identity-encryption.service';
import { KeyedDigestService } from '../../common/security/keyed-digest.service';
import { AuthEnvironment } from '../../config/environment.validation';
import {
  EngineInvalidResponseError,
  EngineUnavailableError,
} from '../../integrations/engine/engine.errors';
import {
  EngineEvaluation,
  EngineService,
} from '../../integrations/engine/engine.service';
import { VerificationStorageService } from '../../integrations/verification-storage/verification-storage.service';
import type { AccessTokenClaims } from '../auth/access-token.service';
import {
  ConfirmUploadDto,
  CreateUploadPolicyDto,
  VerificationAttemptResponseDto,
} from './dto/identity-verification.dto';
import { VerificationCleanupService } from './verification-cleanup.service';

export interface VerificationRequestContext {
  correlationId: string;
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class IdentityVerificationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService<AuthEnvironment, true>,
    private readonly digests: KeyedDigestService,
    private readonly encryption: IdentityEncryptionService,
    private readonly storage: VerificationStorageService,
    private readonly engine: EngineService,
    private readonly cleanup: VerificationCleanupService,
  ) {}

  async createAttempt(
    claims: AccessTokenClaims,
    context: VerificationRequestContext,
  ): Promise<VerificationAttemptResponseDto> {
    const now = new Date();
    const windowStart = new Date(
      now.getTime() -
        this.config.get('VERIFICATION_ATTEMPT_WINDOW_HOURS', {
          infer: true,
        }) *
          3_600_000,
    );
    const result = await this.database.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { id: claims.sub },
        select: {
          emailVerifiedAt: true,
          accountStatus: true,
          identityVerificationStatus: true,
          citizenIdentity: { select: { verifiedAt: true } },
          consents: {
            where: {
              consentType: ConsentType.BIOMETRIC_PROCESSING,
              revokedAt: null,
            },
            take: 1,
            select: { id: true },
          },
        },
      });
      if (
        !user ||
        !user.emailVerifiedAt ||
        user.accountStatus !== UserAccountStatus.ACTIVE ||
        !user.citizenIdentity?.verifiedAt
      ) {
        throw new ForbiddenException({
          code: 'IDENTITY_VERIFICATION_NOT_ELIGIBLE',
          message: 'Identity verification is not available for this account.',
        });
      }
      if (
        user.identityVerificationStatus === IdentityVerificationStatus.VERIFIED
      ) {
        throw new ConflictException({
          code: 'IDENTITY_ALREADY_VERIFIED',
          message: 'Identity verification is already complete.',
        });
      }
      if (user.consents.length === 0) {
        throw new ForbiddenException({
          code: 'BIOMETRIC_CONSENT_REQUIRED',
          message: 'Biometric-processing consent is required.',
        });
      }
      const [attemptCount, activeAttempt, latestAttempt, oldestWindowAttempt] =
        await Promise.all([
          transaction.identityVerificationAttempt.count({
            where: {
              userId: claims.sub,
              purpose: VerificationPurpose.ACCOUNT_ENROLLMENT,
              startedAt: { gte: windowStart },
            },
          }),
          transaction.identityVerificationAttempt.findFirst({
            where: {
              userId: claims.sub,
              purpose: VerificationPurpose.ACCOUNT_ENROLLMENT,
              status: {
                in: [
                  VerificationAttemptStatus.PENDING,
                  VerificationAttemptStatus.MEDIA_PENDING,
                  VerificationAttemptStatus.PROCESSING,
                ],
              },
            },
            select: { id: true },
          }),
          transaction.identityVerificationAttempt.findFirst({
            where: {
              userId: claims.sub,
              purpose: VerificationPurpose.ACCOUNT_ENROLLMENT,
            },
            orderBy: { attemptNumber: 'desc' },
            select: { attemptNumber: true, retryAfter: true },
          }),
          transaction.identityVerificationAttempt.findFirst({
            where: {
              userId: claims.sub,
              purpose: VerificationPurpose.ACCOUNT_ENROLLMENT,
              startedAt: { gte: windowStart },
            },
            orderBy: { startedAt: 'asc' },
            select: { startedAt: true },
          }),
        ]);
      if (activeAttempt) {
        throw new ConflictException({
          code: 'IDENTITY_VERIFICATION_IN_PROGRESS',
          message: 'An identity-verification attempt is already active.',
        });
      }
      if (latestAttempt?.retryAfter && latestAttempt.retryAfter > now) {
        throw new HttpException(
          {
            code: 'IDENTITY_VERIFICATION_RETRY_LATER',
            message: 'Identity verification is temporarily unavailable.',
            retryAfter: latestAttempt.retryAfter,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (
        attemptCount >=
        this.config.get('VERIFICATION_MAX_ATTEMPTS', { infer: true })
      ) {
        throw new HttpException(
          {
            code: 'IDENTITY_VERIFICATION_LIMIT_REACHED',
            message: 'Identity verification is temporarily unavailable.',
            retryAfter: new Date(
              (oldestWindowAttempt?.startedAt ?? now).getTime() +
                this.config.get('VERIFICATION_ATTEMPT_WINDOW_HOURS', {
                  infer: true,
                }) *
                  3_600_000,
            ),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      const attempt = await transaction.identityVerificationAttempt.create({
        data: {
          userId: claims.sub,
          purpose: VerificationPurpose.ACCOUNT_ENROLLMENT,
          status: VerificationAttemptStatus.MEDIA_PENDING,
          policyVersion: this.config.get('VERIFICATION_POLICY_VERSION', {
            infer: true,
          }),
          documentBindingVerified: true,
          attemptNumber: (latestAttempt?.attemptNumber ?? 0) + 1,
          ipHash: this.digests.requestContext(context.ipAddress),
          userAgentHash: this.digests.requestContext(context.userAgent),
        },
        select: attemptSelect,
      });
      await transaction.user.update({
        where: { id: claims.sub },
        data: {
          identityVerificationStatus: IdentityVerificationStatus.PENDING,
          verificationAttempts: { increment: 1 },
          version: { increment: 1 },
        },
      });
      await transaction.authSecurityEvent.create({
        data: {
          userId: claims.sub,
          sessionId: claims.sid,
          eventType: AuthSecurityEventType.IDENTITY_VERIFICATION_STARTED,
          severity: SecurityEventSeverity.INFO,
          outcome: SecurityEventOutcome.SUCCESS,
          correlationId: context.correlationId,
          ipHash: this.digests.requestContext(context.ipAddress),
        },
      });
      return attempt;
    });
    return result;
  }

  async createUploadPolicy(
    claims: AccessTokenClaims,
    attemptId: string,
    input: CreateUploadPolicyDto,
  ) {
    this.assertDocumentMedia(input.mediaType);
    this.assertDimensions(input.width, input.height);
    const attempt = await this.ownedActiveAttempt(claims.sub, attemptId);
    const policy = await this.storage.createUploadPolicy({
      attemptId,
      mediaType: input.mediaType,
      contentType: input.contentType,
      checksum: input.checksum,
      width: input.width,
      height: input.height,
    });
    return {
      uploadUrl: policy.url,
      fields: policy.fields,
      objectKey: policy.objectKey,
      expiresAt: policy.expiresAt,
      maximumSizeBytes: policy.maximumSizeBytes,
      attemptId: attempt.id,
    };
  }

  async confirmUpload(
    claims: AccessTokenClaims,
    attemptId: string,
    input: ConfirmUploadDto,
  ): Promise<{ status: 'confirmed' }> {
    this.assertDocumentMedia(input.mediaType);
    this.assertDimensions(input.width, input.height);
    await this.ownedActiveAttempt(claims.sub, attemptId);
    const requiredPrefix = `${this.config.get('AWS_S3_VERIFICATION_PREFIX', {
      infer: true,
    })}${attemptId}/`;
    if (!input.objectKey.startsWith(requiredPrefix)) {
      throw this.invalidMedia();
    }
    let confirmed;
    try {
      confirmed = await this.storage.confirmObject({
        ...input,
        attemptId,
      });
    } catch {
      throw this.invalidMedia();
    }
    const expiresAt = new Date(
      Date.now() +
        this.config.get('VERIFICATION_MEDIA_RETENTION_SECONDS', {
          infer: true,
        }) *
          1_000,
    );
    try {
      await this.database.verificationMedia.create({
        data: {
          verificationAttemptId: attemptId,
          mediaType: input.mediaType,
          objectKeyEncryptedOrOpaqueReference: this.encryption.seal(
            input.objectKey,
            'verification-media-reference',
          ),
          objectReferenceDigest: this.storage.objectReferenceDigest(
            input.objectKey,
          ),
          objectVersion: confirmed.objectVersion,
          checksum: confirmed.checksum,
          contentType: confirmed.contentType,
          sizeBytes: confirmed.sizeBytes,
          expiresAt,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'VERIFICATION_MEDIA_ALREADY_CONFIRMED',
          message: 'Verification media is already confirmed.',
        });
      }
      throw error;
    }
    return { status: 'confirmed' };
  }

  async createLivenessSession(
    claims: AccessTokenClaims,
    attemptId: string,
  ): Promise<{ sessionId: string; expiresAt: string }> {
    const attempt = await this.ownedActiveAttempt(claims.sub, attemptId);
    if (attempt.livenessSessionId) {
      return {
        sessionId: attempt.livenessSessionId,
        expiresAt: new Date(
          attempt.startedAt.getTime() +
            this.config.get('VERIFICATION_MEDIA_RETENTION_SECONDS', {
              infer: true,
            }) *
              1_000,
        ).toISOString(),
      };
    }
    let created;
    try {
      created = await this.engine.createLivenessSession({
        requestId: randomUUID(),
        attemptId,
        userId: claims.sub,
        policyVersion: attempt.policyVersion,
      });
    } catch {
      throw new ServiceUnavailableException({
        code: 'LIVENESS_PROVIDER_UNAVAILABLE',
        message: 'Liveness verification is temporarily unavailable.',
      });
    }
    const updated = await this.database.identityVerificationAttempt.updateMany({
      where: {
        id: attemptId,
        userId: claims.sub,
        livenessSessionId: null,
        status: VerificationAttemptStatus.MEDIA_PENDING,
      },
      data: { livenessSessionId: created.sessionId },
    });
    if (updated.count !== 1) {
      throw new ConflictException({
        code: 'LIVENESS_SESSION_CONFLICT',
        message: 'A liveness session was created concurrently.',
      });
    }
    return created;
  }

  async submit(
    claims: AccessTokenClaims,
    attemptId: string,
    context: VerificationRequestContext,
  ): Promise<VerificationAttemptResponseDto> {
    const attempt = await this.database.identityVerificationAttempt.findFirst({
      where: { id: attemptId, userId: claims.sub },
      select: {
        ...attemptSelect,
        livenessSessionId: true,
        documentBindingVerified: true,
        media: {
          where: {
            mediaType: VerificationMediaType.ID_DOCUMENT,
            deletedAt: null,
          },
          take: 1,
          select: { objectKeyEncryptedOrOpaqueReference: true },
        },
      },
    });
    if (
      !attempt ||
      !attempt.livenessSessionId ||
      !attempt.documentBindingVerified ||
      attempt.media.length !== 1 ||
      !new Set<VerificationAttemptStatus>([
        VerificationAttemptStatus.MEDIA_PENDING,
        VerificationAttemptStatus.PROVIDER_UNAVAILABLE,
      ]).has(attempt.status) ||
      (attempt.retryAfter && attempt.retryAfter > new Date())
    ) {
      throw new BadRequestException({
        code: 'IDENTITY_VERIFICATION_NOT_READY',
        message: 'The identity-verification attempt is not ready.',
      });
    }
    const claimed = await this.database.identityVerificationAttempt.updateMany({
      where: {
        id: attemptId,
        userId: claims.sub,
        status: attempt.status,
      },
      data: {
        status: VerificationAttemptStatus.PROCESSING,
        engineRequestId: randomUUID(),
        retryAfter: null,
      },
    });
    if (claimed.count !== 1) {
      throw new ConflictException({
        code: 'IDENTITY_VERIFICATION_SUBMIT_CONFLICT',
        message: 'The attempt is already processing.',
      });
    }
    let evaluation: EngineEvaluation;
    try {
      evaluation = await this.engine.evaluate({
        requestId: randomUUID(),
        attemptId,
        userId: claims.sub,
        idDocumentReference: this.encryption.open(
          attempt.media[0].objectKeyEncryptedOrOpaqueReference,
          'verification-media-reference',
        ),
        livenessSessionId: attempt.livenessSessionId,
        documentBindingVerified: true,
        policyVersion: attempt.policyVersion,
        idempotencyKey: attemptId,
      });
    } catch (error) {
      if (
        error instanceof EngineUnavailableError ||
        error instanceof EngineInvalidResponseError
      ) {
        return this.recordUnavailable(attemptId);
      }
      throw error;
    }
    if (
      evaluation.policyVersion !== attempt.policyVersion ||
      (evaluation.decision === 'PASS' && !evaluation.documentBindingVerified) ||
      Math.abs(Date.now() - new Date(evaluation.evaluatedAt).getTime()) >
        300_000
    ) {
      return this.recordUnavailable(attemptId);
    }
    if (evaluation.decision === 'PROVIDER_UNAVAILABLE') {
      return this.recordUnavailable(attemptId);
    }
    const completed = await this.completeAttempt(
      claims,
      attemptId,
      attempt.purpose,
      evaluation,
      context,
    );
    if (completed.status !== VerificationAttemptStatus.REVIEW_REQUIRED) {
      await this.cleanup.deleteAttemptMedia(attemptId);
    }
    return completed;
  }

  async status(claims: AccessTokenClaims): Promise<{
    identityVerificationStatus: IdentityVerificationStatus;
    latestAttempt: VerificationAttemptResponseDto | null;
  }> {
    const user = await this.database.user.findUnique({
      where: { id: claims.sub },
      select: {
        identityVerificationStatus: true,
        identityVerificationAttempts: {
          where: { purpose: VerificationPurpose.ACCOUNT_ENROLLMENT },
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: attemptSelect,
        },
      },
    });
    if (!user) {
      throw new NotFoundException();
    }
    return {
      identityVerificationStatus: user.identityVerificationStatus,
      latestAttempt: user.identityVerificationAttempts[0] ?? null,
    };
  }

  async attempt(
    claims: AccessTokenClaims,
    attemptId: string,
  ): Promise<VerificationAttemptResponseDto> {
    const attempt = await this.database.identityVerificationAttempt.findFirst({
      where: { id: attemptId, userId: claims.sub },
      select: attemptSelect,
    });
    if (!attempt) {
      throw new NotFoundException({
        code: 'VERIFICATION_ATTEMPT_NOT_FOUND',
        message: 'Verification attempt not found.',
      });
    }
    return attempt;
  }

  private async completeAttempt(
    claims: AccessTokenClaims,
    attemptId: string,
    purpose: VerificationPurpose,
    evaluation: EngineEvaluation,
    context: VerificationRequestContext,
  ): Promise<VerificationAttemptResponseDto> {
    const mapped = mapDecision(evaluation.decision);
    const retryAfter =
      mapped.attemptStatus === VerificationAttemptStatus.RETRY_REQUIRED
        ? new Date(
            Date.now() +
              this.config.get('VERIFICATION_RETRY_DELAY_SECONDS', {
                infer: true,
              }) *
                1_000,
          )
        : null;
    return this.database.$transaction(async (transaction) => {
      const updated = await transaction.identityVerificationAttempt.updateMany({
        where: {
          id: attemptId,
          userId: claims.sub,
          status: VerificationAttemptStatus.PROCESSING,
        },
        data: {
          status: mapped.attemptStatus,
          policyVersion: evaluation.policyVersion,
          documentBindingVerified: evaluation.documentBindingVerified,
          faceSimilarity: evaluation.faceSimilarity,
          livenessConfidence: evaluation.livenessConfidence,
          compositeScore: evaluation.compositeScore,
          reasonCode: safeReason(evaluation.reasonCode),
          completedAt: new Date(evaluation.evaluatedAt),
          retryAfter,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException({
          code: 'IDENTITY_VERIFICATION_COMPLETION_CONFLICT',
          message: 'The verification result was already recorded.',
        });
      }
      if (purpose === VerificationPurpose.ACCOUNT_ENROLLMENT) {
        await transaction.user.update({
          where: { id: claims.sub },
          data: {
            identityVerificationStatus: mapped.userStatus,
            ...(mapped.userStatus === IdentityVerificationStatus.VERIFIED
              ? {
                  idVerifiedAt: new Date(evaluation.evaluatedAt),
                  isIdVerified: true,
                }
              : {}),
            version: { increment: 1 },
          },
        });
      }
      await transaction.authSecurityEvent.create({
        data: {
          userId: claims.sub,
          sessionId: claims.sid,
          eventType: AuthSecurityEventType.IDENTITY_VERIFICATION_COMPLETED,
          severity:
            mapped.attemptStatus === VerificationAttemptStatus.PASSED
              ? SecurityEventSeverity.INFO
              : SecurityEventSeverity.WARNING,
          outcome:
            mapped.attemptStatus === VerificationAttemptStatus.PASSED
              ? SecurityEventOutcome.SUCCESS
              : SecurityEventOutcome.FAILURE,
          reasonCode: safeReason(evaluation.reasonCode),
          correlationId: context.correlationId,
          ipHash: this.digests.requestContext(context.ipAddress),
        },
      });
      if (
        mapped.attemptStatus === VerificationAttemptStatus.PASSED &&
        purpose === VerificationPurpose.ACCOUNT_ENROLLMENT
      ) {
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'USER',
            aggregateId: claims.sub,
            eventType: 'IDENTITY_VERIFICATION_COMPLETED',
            payload: { userId: claims.sub, attemptId },
          },
        });
      }
      const result =
        await transaction.identityVerificationAttempt.findUniqueOrThrow({
          where: { id: attemptId },
          select: attemptSelect,
        });
      return result;
    });
  }

  private async recordUnavailable(
    attemptId: string,
  ): Promise<VerificationAttemptResponseDto> {
    const retryAfter = new Date(
      Date.now() +
        this.config.get('VERIFICATION_RETRY_DELAY_SECONDS', { infer: true }) *
          1_000,
    );
    return this.database.identityVerificationAttempt.update({
      where: { id: attemptId },
      data: {
        status: VerificationAttemptStatus.PROVIDER_UNAVAILABLE,
        reasonCode: 'PROVIDER_UNAVAILABLE',
        retryAfter,
      },
      select: attemptSelect,
    });
  }

  private async ownedActiveAttempt(userId: string, attemptId: string) {
    const attempt = await this.database.identityVerificationAttempt.findFirst({
      where: {
        id: attemptId,
        userId,
        status: VerificationAttemptStatus.MEDIA_PENDING,
      },
      select: {
        id: true,
        policyVersion: true,
        livenessSessionId: true,
        startedAt: true,
      },
    });
    if (!attempt) {
      throw new NotFoundException({
        code: 'VERIFICATION_ATTEMPT_NOT_FOUND',
        message: 'Verification attempt not found.',
      });
    }
    return attempt;
  }

  private assertDocumentMedia(mediaType: VerificationMediaType): void {
    if (mediaType !== VerificationMediaType.ID_DOCUMENT) {
      throw this.invalidMedia();
    }
  }

  private assertDimensions(width: number, height: number): void {
    if (
      width * height >
      this.config.get('VERIFICATION_MEDIA_MAX_PIXELS', { infer: true })
    ) {
      throw this.invalidMedia();
    }
  }

  private invalidMedia(): BadRequestException {
    return new BadRequestException({
      code: 'VERIFICATION_MEDIA_INVALID',
      message: 'Verification media does not satisfy the upload policy.',
    });
  }
}

const attemptSelect = {
  id: true,
  purpose: true,
  status: true,
  attemptNumber: true,
  policyVersion: true,
  retryAfter: true,
  reasonCode: true,
} satisfies Prisma.IdentityVerificationAttemptSelect;

function mapDecision(decision: EngineEvaluation['decision']): {
  attemptStatus: VerificationAttemptStatus;
  userStatus: IdentityVerificationStatus;
} {
  switch (decision) {
    case 'PASS':
      return {
        attemptStatus: VerificationAttemptStatus.PASSED,
        userStatus: IdentityVerificationStatus.VERIFIED,
      };
    case 'MANUAL_REVIEW':
      return {
        attemptStatus: VerificationAttemptStatus.REVIEW_REQUIRED,
        userStatus: IdentityVerificationStatus.REVIEW_REQUIRED,
      };
    case 'RETRY':
      return {
        attemptStatus: VerificationAttemptStatus.RETRY_REQUIRED,
        userStatus: IdentityVerificationStatus.RETRY_REQUIRED,
      };
    case 'PROVIDER_UNAVAILABLE':
      return {
        attemptStatus: VerificationAttemptStatus.PROVIDER_UNAVAILABLE,
        userStatus: IdentityVerificationStatus.PENDING,
      };
    default:
      return {
        attemptStatus: VerificationAttemptStatus.FAILED,
        userStatus: IdentityVerificationStatus.RETRY_REQUIRED,
      };
  }
}

function safeReason(value: string): string {
  return /^[A-Z][A-Z0-9_]{0,63}$/.test(value)
    ? value
    : 'VERIFICATION_UNAVAILABLE';
}
