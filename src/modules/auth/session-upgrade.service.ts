import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuthSecurityEventType,
  IdempotencyStatus,
  IdentityVerificationStatus,
  Prisma,
  SecurityEventOutcome,
  SecurityEventSeverity,
  SessionLevel,
  SessionStatus,
  UserAccountStatus,
  VerificationAttemptStatus,
  VerificationPurpose,
} from '@mucyora/db';

import { DatabaseService } from '../../common/database/database.service';
import { IdentityEncryptionService } from '../../common/security/identity-encryption.service';
import { KeyedDigestService } from '../../common/security/keyed-digest.service';
import { TokenService } from '../../common/security/token.service';
import { AuthEnvironment } from '../../config/environment.validation';
import { AccessTokenClaims, AccessTokenService } from './access-token.service';
import {
  AuthenticationRequestContext,
  IssuedAuthentication,
} from './authentication.service';
import { TokenTransport } from './dto/auth.dto';
import { SessionUpgradeDto } from './dto/session-upgrade.dto';
import { SESSION_UPGRADE_REVOCATION_REASON } from './session-upgrade.guard';

interface UpgradeResult {
  userId: string;
  sessionId: string;
  refreshToken: string;
  transport: TokenTransport;
}

@Injectable()
export class SessionUpgradeService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService<AuthEnvironment, true>,
    private readonly tokens: TokenService,
    private readonly digests: KeyedDigestService,
    private readonly encryption: IdentityEncryptionService,
    private readonly accessTokens: AccessTokenService,
  ) {}

  async upgrade(
    claims: AccessTokenClaims,
    input: SessionUpgradeDto,
    idempotencyKey: string,
    context: AuthenticationRequestContext,
  ): Promise<IssuedAuthentication> {
    const now = new Date();
    const generatedRefresh = this.tokens.generate(48);
    const scope = `auth:session-upgrade:${claims.sid}`;
    const requestDigest = this.digests.requestContext(
      JSON.stringify({
        userId: claims.sub,
        sessionId: claims.sid,
        verificationAttemptId: input.verificationAttemptId,
        transport: input.transport,
      }),
    );

    const result = await this.database.$transaction(
      async (transaction) => {
        const existing = await transaction.idempotencyRecord.findUnique({
          where: { scope_key: { scope, key: idempotencyKey } },
        });
        if (existing) {
          if (existing.requestDigest !== requestDigest) {
            throw new ConflictException({
              code: 'IDEMPOTENCY_KEY_REUSED',
              message: 'The idempotency key was used for another request.',
            });
          }
          if (
            existing.status === IdempotencyStatus.COMPLETED &&
            existing.responseReference &&
            existing.expiresAt > now
          ) {
            return this.openResult(existing.responseReference);
          }
          throw new ConflictException({
            code: 'SESSION_UPGRADE_IN_PROGRESS',
            message: 'This session upgrade is already in progress.',
          });
        }

        await transaction.idempotencyRecord.create({
          data: {
            scope,
            key: idempotencyKey,
            requestDigest,
            expiresAt: new Date(
              now.getTime() +
                this.config.get('SESSION_UPGRADE_IDEMPOTENCY_TTL_SECONDS', {
                  infer: true,
                }) *
                  1_000,
            ),
          },
        });

        const limitedSession = await transaction.authSession.findUnique({
          where: { id: claims.sid },
          select: {
            userId: true,
            status: true,
            sessionLevel: true,
            expiresAt: true,
            deviceId: true,
            deviceLabel: true,
            ipHash: true,
            userAgentHash: true,
            user: {
              select: {
                accountStatus: true,
                identityVerificationStatus: true,
              },
            },
          },
        });
        if (
          !limitedSession ||
          limitedSession.userId !== claims.sub ||
          limitedSession.status !== SessionStatus.ACTIVE ||
          limitedSession.sessionLevel !== SessionLevel.LIMITED ||
          limitedSession.expiresAt <= now
        ) {
          throw new ConflictException({
            code: 'SESSION_ALREADY_UPGRADED',
            message: 'The limited session is no longer eligible for upgrade.',
          });
        }
        if (
          limitedSession.user.accountStatus !== UserAccountStatus.ACTIVE ||
          limitedSession.user.identityVerificationStatus !==
            IdentityVerificationStatus.VERIFIED
        ) {
          throw new ForbiddenException({
            code: 'IDENTITY_NOT_VERIFIED',
            message: 'Identity verification must pass before session upgrade.',
          });
        }

        const attempt = await transaction.identityVerificationAttempt.findFirst(
          {
            where: {
              id: input.verificationAttemptId,
              userId: claims.sub,
              purpose: VerificationPurpose.ACCOUNT_ENROLLMENT,
              status: VerificationAttemptStatus.PASSED,
            },
            select: { id: true },
          },
        );
        if (!attempt) {
          throw new ForbiddenException({
            code: 'VERIFICATION_ATTEMPT_INVALID',
            message: 'A passed account-enrollment attempt is required.',
          });
        }

        const revoked = await transaction.authSession.updateMany({
          where: {
            id: claims.sid,
            userId: claims.sub,
            status: SessionStatus.ACTIVE,
            sessionLevel: SessionLevel.LIMITED,
          },
          data: {
            status: SessionStatus.REVOKED,
            revokedAt: now,
            revocationReason: SESSION_UPGRADE_REVOCATION_REASON,
            version: { increment: 1 },
          },
        });
        if (revoked.count !== 1) {
          throw new ConflictException({
            code: 'SESSION_UPGRADE_CONFLICT',
            message: 'Another request upgraded this session.',
          });
        }

        await transaction.refreshToken.updateMany({
          where: { sessionId: claims.sid, revokedAt: null },
          data: { revoked: true, revokedAt: now },
        });
        const fullSession = await transaction.authSession.create({
          data: {
            userId: claims.sub,
            sessionFamilyId: randomUUID(),
            sessionLevel: SessionLevel.FULL,
            deviceId: limitedSession.deviceId,
            deviceLabel: limitedSession.deviceLabel,
            ipHash: limitedSession.ipHash,
            userAgentHash: limitedSession.userAgentHash,
            expiresAt: new Date(
              now.getTime() +
                this.config.get('REFRESH_TOKEN_TTL_SECONDS', { infer: true }) *
                  1_000,
            ),
          },
          select: { id: true },
        });
        await transaction.refreshToken.create({
          data: {
            userId: claims.sub,
            sessionId: fullSession.id,
            tokenDigest: generatedRefresh.digest,
            tokenType: 'full',
            generation: 0,
            expiresAt: new Date(
              now.getTime() +
                this.config.get('REFRESH_TOKEN_TTL_SECONDS', { infer: true }) *
                  1_000,
            ),
          },
        });
        await transaction.authSecurityEvent.create({
          data: {
            userId: claims.sub,
            sessionId: fullSession.id,
            eventType: AuthSecurityEventType.SESSION_REFRESHED,
            severity: SecurityEventSeverity.INFO,
            outcome: SecurityEventOutcome.SUCCESS,
            reasonCode: 'LIMITED_TO_FULL_SESSION_UPGRADE',
            correlationId: context.correlationId,
            ipHash: this.digests.requestContext(context.ipAddress),
          },
        });

        const upgradeResult: UpgradeResult = {
          userId: claims.sub,
          sessionId: fullSession.id,
          refreshToken: generatedRefresh.token,
          transport: input.transport,
        };
        await transaction.idempotencyRecord.update({
          where: { scope_key: { scope, key: idempotencyKey } },
          data: {
            status: IdempotencyStatus.COMPLETED,
            responseReference: this.encryption.seal(
              JSON.stringify(upgradeResult),
              'session-upgrade-result',
            ),
          },
        });
        return upgradeResult;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    const activeFullSession = await this.database.authSession.findFirst({
      where: {
        id: result.sessionId,
        userId: result.userId,
        status: SessionStatus.ACTIVE,
        sessionLevel: SessionLevel.FULL,
        expiresAt: { gt: now },
      },
      select: { id: true },
    });
    if (!activeFullSession) {
      throw new ConflictException({
        code: 'UPGRADED_SESSION_UNAVAILABLE',
        message: 'The upgraded session is no longer active.',
      });
    }

    const access = this.accessTokens.issue({
      userId: result.userId,
      sessionId: result.sessionId,
      sessionLevel: SessionLevel.FULL,
    });
    return {
      response: {
        accessToken: access.token,
        expiresIn: access.expiresIn,
        sessionLevel: SessionLevel.FULL,
        identityVerified: true,
        ...(result.transport === TokenTransport.NATIVE
          ? { refreshToken: result.refreshToken }
          : {}),
      },
      refreshToken: result.refreshToken,
      csrfToken: this.digests.requestContext(result.refreshToken),
      transport: result.transport,
    };
  }

  private openResult(value: string): UpgradeResult {
    const result = JSON.parse(
      this.encryption.open(value, 'session-upgrade-result'),
    ) as Partial<UpgradeResult>;
    if (
      !result.userId ||
      !result.sessionId ||
      !result.refreshToken ||
      !Object.values(TokenTransport).includes(
        result.transport as TokenTransport,
      )
    ) {
      throw new Error('Invalid session-upgrade result.');
    }
    return result as UpgradeResult;
  }
}
