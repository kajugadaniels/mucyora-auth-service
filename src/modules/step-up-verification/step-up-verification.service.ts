import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuthSecurityEventType,
  ConsentType,
  IdentityVerificationStatus,
  SecurityEventOutcome,
  SecurityEventSeverity,
  StepUpChallengeStatus,
  UserAccountStatus,
  VerificationAttemptStatus,
  VerificationPurpose,
} from '@mucyora/db';

import { DatabaseService } from '../../common/database/database.service';
import { IdentityEncryptionService } from '../../common/security/identity-encryption.service';
import { KeyedDigestService } from '../../common/security/keyed-digest.service';
import { TokenService } from '../../common/security/token.service';
import { AuthEnvironment } from '../../config/environment.validation';
import type { AccessTokenClaims } from '../auth/access-token.service';
import type { VerificationRequestContext } from '../identity-verification/identity-verification.service';
import {
  ConsumeStepUpAssertionDto,
  CreateStepUpChallengeDto,
  isStepUpPurpose,
} from './dto/step-up-verification.dto';
import type { StepUpConsumerService } from './internal-service.guard';

const PURPOSE_CONSUMERS: Record<
  Exclude<VerificationPurpose, 'ACCOUNT_ENROLLMENT'>,
  StepUpConsumerService
> = {
  [VerificationPurpose.DEVICE_TRANSFER]: 'mucyora-user',
  [VerificationPurpose.AGREEMENT_SIGNING]: 'mucyora-signature',
  [VerificationPurpose.ACCOUNT_RECOVERY]: 'mucyora-auth-recovery',
};

@Injectable()
export class StepUpVerificationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService<AuthEnvironment, true>,
    private readonly digests: KeyedDigestService,
    private readonly tokens: TokenService,
    private readonly encryption: IdentityEncryptionService,
  ) {}

  async createChallenge(
    claims: AccessTokenClaims,
    input: CreateStepUpChallengeDto,
    context: VerificationRequestContext,
  ) {
    this.assertPurpose(input.purpose);
    const now = new Date();
    const targetResourceDigest = this.targetDigest(
      input.purpose,
      input.targetResourceId,
    );
    await this.expireDue(now);

    return this.database.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { id: claims.sub },
        select: {
          accountStatus: true,
          identityVerificationStatus: true,
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
        user.accountStatus !== UserAccountStatus.ACTIVE ||
        user.identityVerificationStatus !==
          IdentityVerificationStatus.VERIFIED ||
        user.consents.length === 0
      ) {
        throw new ForbiddenException({
          code: 'STEP_UP_NOT_ELIGIBLE',
          message: 'Fresh identity verification is not available.',
        });
      }

      const existing = await transaction.stepUpChallenge.findFirst({
        where: {
          userId: claims.sub,
          purpose: input.purpose,
          targetResourceDigest,
          status: {
            in: [StepUpChallengeStatus.PENDING, StepUpChallengeStatus.VERIFIED],
          },
          expiresAt: { gt: now },
        },
        select: challengeSelect,
      });
      if (existing) {
        return existing;
      }

      const latest = await transaction.identityVerificationAttempt.findFirst({
        where: { userId: claims.sub, purpose: input.purpose },
        orderBy: { attemptNumber: 'desc' },
        select: { attemptNumber: true },
      });
      const policyVersion = this.config.get('STEP_UP_POLICY_VERSION', {
        infer: true,
      });
      const attempt = await transaction.identityVerificationAttempt.create({
        data: {
          userId: claims.sub,
          purpose: input.purpose,
          status: VerificationAttemptStatus.MEDIA_PENDING,
          policyVersion,
          documentBindingVerified: true,
          attemptNumber: (latest?.attemptNumber ?? 0) + 1,
          ipHash: this.digests.requestContext(context.ipAddress),
          userAgentHash: this.digests.requestContext(context.userAgent),
        },
        select: { id: true },
      });
      const challenge = await transaction.stepUpChallenge.create({
        data: {
          userId: claims.sub,
          sessionId: claims.sid,
          verificationAttemptId: attempt.id,
          purpose: input.purpose,
          targetResourceDigest,
          policyVersion,
          expiresAt: new Date(
            now.getTime() +
              this.config.get('STEP_UP_CHALLENGE_TTL_SECONDS', {
                infer: true,
              }) *
                1_000,
          ),
        },
        select: challengeSelect,
      });
      await transaction.authSecurityEvent.create({
        data: {
          userId: claims.sub,
          sessionId: claims.sid,
          eventType: AuthSecurityEventType.IDENTITY_VERIFICATION_STARTED,
          severity: SecurityEventSeverity.INFO,
          outcome: SecurityEventOutcome.SUCCESS,
          reasonCode: `STEP_UP_${input.purpose}`,
          correlationId: context.correlationId,
          ipHash: this.digests.requestContext(context.ipAddress),
        },
      });
      return challenge;
    });
  }

  async challenge(claims: AccessTokenClaims, challengeId: string) {
    await this.expireDue(new Date());
    const challenge = await this.database.stepUpChallenge.findFirst({
      where: { id: challengeId, userId: claims.sub },
      select: challengeSelect,
    });
    if (!challenge) {
      throw this.notFound();
    }
    return challenge;
  }

  async issueAssertion(
    claims: AccessTokenClaims,
    challengeId: string,
    context: VerificationRequestContext,
  ): Promise<{ assertion: string; expiresAt: Date }> {
    const now = new Date();
    await this.expireDue(now);
    const challenge = await this.database.stepUpChallenge.findFirst({
      where: { id: challengeId, userId: claims.sub },
      select: {
        ...challengeSelect,
        assertionEncrypted: true,
        verificationAttempt: { select: { status: true } },
      },
    });
    if (
      !challenge ||
      challenge.status === StepUpChallengeStatus.CONSUMED ||
      challenge.status === StepUpChallengeStatus.REVOKED ||
      challenge.status === StepUpChallengeStatus.EXPIRED
    ) {
      throw this.notFound();
    }
    if (
      challenge.status === StepUpChallengeStatus.VERIFIED &&
      challenge.assertionEncrypted &&
      challenge.assertionExpiresAt &&
      challenge.assertionExpiresAt > now
    ) {
      return {
        assertion: this.encryption.open(
          challenge.assertionEncrypted,
          'step-up-assertion',
        ),
        expiresAt: challenge.assertionExpiresAt,
      };
    }
    if (
      challenge.verificationAttempt.status !== VerificationAttemptStatus.PASSED
    ) {
      throw new ConflictException({
        code: 'STEP_UP_VERIFICATION_INCOMPLETE',
        message: 'Fresh identity verification has not passed.',
      });
    }

    const assertion = this.tokens.generate(48);
    const assertionExpiresAt = new Date(
      Math.min(
        challenge.expiresAt.getTime(),
        now.getTime() +
          this.config.get('STEP_UP_ASSERTION_TTL_SECONDS', { infer: true }) *
            1_000,
      ),
    );
    const updated = await this.database.$transaction(async (transaction) => {
      const claimed = await transaction.stepUpChallenge.updateMany({
        where: {
          id: challengeId,
          userId: claims.sub,
          status: StepUpChallengeStatus.PENDING,
          expiresAt: { gt: now },
        },
        data: {
          status: StepUpChallengeStatus.VERIFIED,
          assertionDigest: assertion.digest,
          assertionEncrypted: this.encryption.seal(
            assertion.token,
            'step-up-assertion',
          ),
          verifiedAt: now,
          assertionExpiresAt,
        },
      });
      if (claimed.count !== 1) {
        return false;
      }
      await transaction.authSecurityEvent.create({
        data: {
          userId: claims.sub,
          sessionId: claims.sid,
          eventType: AuthSecurityEventType.IDENTITY_VERIFICATION_COMPLETED,
          severity: SecurityEventSeverity.INFO,
          outcome: SecurityEventOutcome.SUCCESS,
          reasonCode: `STEP_UP_${challenge.purpose}`,
          correlationId: context.correlationId,
          ipHash: this.digests.requestContext(context.ipAddress),
        },
      });
      return true;
    });
    if (!updated) {
      return this.issueAssertion(claims, challengeId, context);
    }
    return { assertion: assertion.token, expiresAt: assertionExpiresAt };
  }

  async consumeAssertion(
    service: StepUpConsumerService,
    input: ConsumeStepUpAssertionDto,
  ) {
    this.assertPurpose(input.purpose);
    if (PURPOSE_CONSUMERS[input.purpose] !== service) {
      throw new ForbiddenException({
        code: 'STEP_UP_PURPOSE_FORBIDDEN',
        message: 'The service cannot consume this assertion purpose.',
      });
    }
    const now = new Date();
    await this.expireDue(now);
    const assertionDigest = this.tokens.digest(input.assertion);
    const challenge = await this.database.stepUpChallenge.findUnique({
      where: { assertionDigest },
      select: {
        id: true,
        userId: true,
        purpose: true,
        targetResourceDigest: true,
        status: true,
        assertionExpiresAt: true,
        verificationAttemptId: true,
        verifiedAt: true,
      },
    });
    if (
      !challenge ||
      challenge.userId !== input.userId ||
      challenge.purpose !== input.purpose ||
      challenge.targetResourceDigest !==
        this.targetDigest(input.purpose, input.targetResourceId) ||
      challenge.status !== StepUpChallengeStatus.VERIFIED ||
      !challenge.assertionExpiresAt ||
      challenge.assertionExpiresAt <= now
    ) {
      throw this.invalidAssertion();
    }
    const consumed = await this.database.stepUpChallenge.updateMany({
      where: {
        id: challenge.id,
        status: StepUpChallengeStatus.VERIFIED,
        assertionExpiresAt: { gt: now },
      },
      data: {
        status: StepUpChallengeStatus.CONSUMED,
        consumedAt: now,
        consumedByService: service,
        assertionEncrypted: null,
      },
    });
    if (consumed.count !== 1) {
      throw this.invalidAssertion();
    }
    return {
      verified: true as const,
      userId: challenge.userId,
      purpose: challenge.purpose,
      verificationAttemptId: challenge.verificationAttemptId,
      verifiedAt: challenge.verifiedAt,
      consumedAt: now,
    };
  }

  private async expireDue(now: Date): Promise<void> {
    await this.database.stepUpChallenge.updateMany({
      where: {
        status: {
          in: [StepUpChallengeStatus.PENDING, StepUpChallengeStatus.VERIFIED],
        },
        OR: [{ expiresAt: { lte: now } }, { assertionExpiresAt: { lte: now } }],
      },
      data: {
        status: StepUpChallengeStatus.EXPIRED,
        assertionEncrypted: null,
      },
    });
  }

  private targetDigest(
    purpose: VerificationPurpose,
    targetResourceId: string,
  ): string {
    return this.digests.requestContext(`${purpose}:${targetResourceId}`);
  }

  private assertPurpose(
    purpose: VerificationPurpose,
  ): asserts purpose is Exclude<VerificationPurpose, 'ACCOUNT_ENROLLMENT'> {
    if (!isStepUpPurpose(purpose)) {
      throw new ForbiddenException({
        code: 'STEP_UP_PURPOSE_INVALID',
        message: 'The verification purpose is not available for step-up.',
      });
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'STEP_UP_CHALLENGE_NOT_FOUND',
      message: 'Step-up challenge not found.',
    });
  }

  private invalidAssertion(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'STEP_UP_ASSERTION_INVALID',
      message: 'The step-up assertion is invalid or unavailable.',
    });
  }
}

const challengeSelect = {
  id: true,
  verificationAttemptId: true,
  purpose: true,
  status: true,
  policyVersion: true,
  expiresAt: true,
  verifiedAt: true,
  assertionExpiresAt: true,
};
