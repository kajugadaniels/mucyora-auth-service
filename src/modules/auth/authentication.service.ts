import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuthSecurityEventType,
  IdentityVerificationStatus,
  SecurityEventOutcome,
  SecurityEventSeverity,
  SessionLevel,
  SessionStatus,
  UserAccountStatus,
} from '@mucyora/db';
import type Redis from 'ioredis';

import { DatabaseService } from '../../common/database/database.service';
import { KeyedDigestService } from '../../common/security/keyed-digest.service';
import { normalizeEmail } from '../../common/security/normalization';
import { PasswordPolicyService } from '../../common/security/password-policy.service';
import { TokenService } from '../../common/security/token.service';
import { AuthEnvironment } from '../../config/environment.validation';
import { ensureRedisConnected } from '../../integrations/redis/redis-connection';
import { REDIS_CLIENT } from '../../integrations/redis/redis.module';
import { SecurityEventWriter } from '../security-events/security-event-writer.service';
import { AccessTokenService } from './access-token.service';
import {
  AuthenticationRateLimitError,
  AuthRateLimiter,
} from './auth-rate-limiter.service';
import { AuthTokenResponseDto, LoginDto, TokenTransport } from './dto/auth.dto';
import { LoginRiskService } from './login-risk.service';

const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export interface AuthenticationRequestContext {
  correlationId: string;
  ipAddress: string;
  userAgent: string;
}

export interface IssuedAuthentication {
  response: AuthTokenResponseDto;
  refreshToken: string;
  csrfToken: string;
  transport: TokenTransport;
}

@Injectable()
export class AuthenticationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService<AuthEnvironment, true>,
    private readonly passwords: PasswordPolicyService,
    private readonly tokens: TokenService,
    private readonly digests: KeyedDigestService,
    private readonly accessTokens: AccessTokenService,
    private readonly rateLimiter: AuthRateLimiter,
    private readonly securityEvents: SecurityEventWriter,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() private readonly loginRisk?: LoginRiskService,
  ) {}

  async login(
    input: LoginDto,
    context: AuthenticationRequestContext,
  ): Promise<IssuedAuthentication> {
    const emailNormalized = normalizeEmail(input.email);
    const ipHash = this.digests.requestContext(context.ipAddress);
    const emailHash = this.digests.requestContext(emailNormalized);
    const deviceHash = this.digests.requestContext(input.deviceId);
    await this.applyLoginRateLimit(ipHash, emailHash, deviceHash);

    const user = await this.database.user.findUnique({
      where: { emailNormalized },
      select: {
        id: true,
        emailVerifiedAt: true,
        accountStatus: true,
        identityVerificationStatus: true,
        credential: {
          select: {
            id: true,
            passwordHash: true,
            failedLoginCount: true,
            lockedUntil: true,
          },
        },
      },
    });

    if (!user?.credential) {
      await this.passwords.verifyDummy(input.password);
      await this.writeLoginFailure(context.correlationId, ipHash);
      throw this.invalidCredentials();
    }
    const credential = user.credential;

    const passwordValid = await this.passwords.verify(
      credential.passwordHash,
      input.password,
    );
    const locked =
      credential.lockedUntil && credential.lockedUntil.getTime() > Date.now();
    if (!passwordValid || locked) {
      await this.recordFailedCredential(
        user.id,
        credential.id,
        credential.failedLoginCount,
        context.correlationId,
        ipHash,
      );
      throw this.invalidCredentials();
    }

    if (
      user.accountStatus === UserAccountStatus.DISABLED ||
      user.accountStatus === UserAccountStatus.SUSPENDED ||
      user.accountStatus === UserAccountStatus.LOCKED
    ) {
      await this.writeLoginFailure(context.correlationId, ipHash, user.id);
      throw this.invalidCredentials();
    }
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        code: 'EMAIL_VERIFICATION_REQUIRED',
        message: 'Email verification is required before authentication.',
      });
    }

    const userAgentHash = this.digests.requestContext(context.userAgent);
    const risk = this.loginRisk
      ? await this.loginRisk.assess({
          userId: user.id,
          deviceId: input.deviceId,
          ipHash,
          userAgentHash,
        })
      : { level: 'LOW' as const, reason: null };
    const sessionLevel =
      user.identityVerificationStatus === IdentityVerificationStatus.VERIFIED &&
      risk.level === 'LOW'
        ? SessionLevel.FULL
        : SessionLevel.LIMITED;
    const refresh = this.tokens.generate(48);
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() +
        this.config.get('REFRESH_TOKEN_TTL_SECONDS', { infer: true }) * 1_000,
    );
    const rehashedPassword = this.passwords.needsRehash(credential.passwordHash)
      ? await this.passwords.hash(input.password, emailNormalized)
      : null;
    const session = await this.database.$transaction(async (transaction) => {
      const created = await transaction.authSession.create({
        data: {
          userId: user.id,
          sessionFamilyId: randomUUID(),
          sessionLevel,
          status: SessionStatus.ACTIVE,
          deviceId: input.deviceId,
          deviceLabel: input.deviceLabel,
          ipHash,
          userAgentHash,
          riskLevel: risk.level,
          riskReason: risk.reason,
          expiresAt,
        },
        select: { id: true },
      });
      await transaction.refreshToken.create({
        data: {
          userId: user.id,
          sessionId: created.id,
          tokenDigest: refresh.digest,
          tokenType: sessionLevel.toLowerCase(),
          generation: 0,
          issuedAt: now,
          expiresAt,
        },
      });
      await transaction.userCredential.update({
        where: { id: credential.id },
        data: {
          failedLoginCount: 0,
          lockedUntil: null,
          ...(rehashedPassword
            ? {
                passwordHash: rehashedPassword,
                passwordAlgorithm: 'argon2id-v19',
              }
            : {}),
        },
      });
      await transaction.authSecurityEvent.create({
        data: {
          userId: user.id,
          sessionId: created.id,
          eventType: AuthSecurityEventType.LOGIN_SUCCEEDED,
          severity: SecurityEventSeverity.INFO,
          outcome: SecurityEventOutcome.SUCCESS,
          correlationId: context.correlationId,
          ipHash,
        },
      });
      return created;
    });

    return this.buildIssuedAuthentication(
      user.id,
      session.id,
      sessionLevel,
      refresh.token,
      input.transport,
    );
  }

  async refresh(
    refreshToken: string,
    transport: TokenTransport,
    context: AuthenticationRequestContext,
  ): Promise<IssuedAuthentication> {
    const tokenDigest = this.tokens.digest(refreshToken);
    await this.applyRefreshRateLimit(tokenDigest);
    const current = await this.database.refreshToken.findUnique({
      where: { tokenDigest },
      select: {
        id: true,
        userId: true,
        sessionId: true,
        generation: true,
        expiresAt: true,
        usedAt: true,
        revokedAt: true,
        session: {
          select: {
            id: true,
            userId: true,
            sessionLevel: true,
            status: true,
            expiresAt: true,
          },
        },
      },
    });
    if (!current?.sessionId || !current.session || !current.userId) {
      throw this.invalidRefresh();
    }
    const session = current.session;
    const sessionId = current.sessionId;
    const userId = current.userId;

    await ensureRedisConnected(this.redis);
    const lockKey = `${this.config.get('CACHE_PREFIX', {
      infer: true,
    })}lock:refresh:${sessionId}`;
    const lockValue = randomUUID();
    const acquired = await this.redis.set(lockKey, lockValue, 'EX', 5, 'NX');
    if (acquired !== 'OK') {
      throw new ConflictException({
        code: 'REFRESH_IN_PROGRESS',
        message: 'A refresh is already in progress.',
      });
    }

    try {
      if (current.usedAt) {
        const withinGrace =
          Date.now() - current.usedAt.getTime() <=
          this.config.get('REFRESH_REPLAY_GRACE_SECONDS', { infer: true }) *
            1_000;
        if (withinGrace) {
          throw new ConflictException({
            code: 'REFRESH_ALREADY_ROTATED',
            message: 'This refresh token was already rotated.',
          });
        }
        await this.revokeForReuse(
          { id: current.id, userId, sessionId },
          context,
        );
        throw this.invalidRefresh();
      }
      if (
        current.revokedAt ||
        current.expiresAt.getTime() <= Date.now() ||
        session.status !== SessionStatus.ACTIVE ||
        session.expiresAt.getTime() <= Date.now()
      ) {
        throw this.invalidRefresh();
      }

      const replacement = this.tokens.generate(48);
      const now = new Date();
      await this.database.$transaction(async (transaction) => {
        const activeSession = await transaction.authSession.updateMany({
          where: {
            id: sessionId,
            status: SessionStatus.ACTIVE,
            expiresAt: { gt: now },
          },
          data: { lastUsedAt: now, version: { increment: 1 } },
        });
        if (activeSession.count !== 1) {
          throw this.invalidRefresh();
        }
        const created = await transaction.refreshToken.create({
          data: {
            userId,
            sessionId,
            tokenDigest: replacement.digest,
            tokenType: session.sessionLevel.toLowerCase(),
            generation: current.generation + 1,
            issuedAt: now,
            expiresAt: session.expiresAt,
          },
          select: { id: true },
        });
        const consumed = await transaction.refreshToken.updateMany({
          where: {
            id: current.id,
            usedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: {
            usedAt: now,
            replacedByTokenId: created.id,
          },
        });
        if (consumed.count !== 1) {
          throw new ConflictException({
            code: 'REFRESH_IN_PROGRESS',
            message: 'A refresh is already in progress.',
          });
        }
        await transaction.authSecurityEvent.create({
          data: {
            userId,
            sessionId,
            eventType: AuthSecurityEventType.SESSION_REFRESHED,
            severity: SecurityEventSeverity.INFO,
            outcome: SecurityEventOutcome.SUCCESS,
            correlationId: context.correlationId,
            ipHash: this.digests.requestContext(context.ipAddress),
          },
        });
      });

      return this.buildIssuedAuthentication(
        userId,
        sessionId,
        session.sessionLevel,
        replacement.token,
        transport,
      );
    } finally {
      await this.redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, lockValue);
    }
  }

  private async revokeForReuse(
    current: {
      id: string;
      userId: string;
      sessionId: string;
    },
    context: AuthenticationRequestContext,
  ): Promise<void> {
    const now = new Date();
    await this.database.$transaction(async (transaction) => {
      await transaction.refreshToken.updateMany({
        where: { sessionId: current.sessionId },
        data: { revokedAt: now },
      });
      await transaction.refreshToken.update({
        where: { id: current.id },
        data: { reuseDetectedAt: now },
      });
      await transaction.authSession.updateMany({
        where: { id: current.sessionId },
        data: {
          status: SessionStatus.COMPROMISED,
          revokedAt: now,
          revocationReason: 'REFRESH_TOKEN_REUSE',
          version: { increment: 1 },
        },
      });
      await transaction.authSecurityEvent.create({
        data: {
          userId: current.userId,
          sessionId: current.sessionId,
          eventType: AuthSecurityEventType.REFRESH_TOKEN_REUSE_DETECTED,
          severity: SecurityEventSeverity.HIGH,
          outcome: SecurityEventOutcome.DENIED,
          reasonCode: 'REFRESH_TOKEN_REUSE',
          correlationId: context.correlationId,
          ipHash: this.digests.requestContext(context.ipAddress),
        },
      });
    });
  }

  private async buildIssuedAuthentication(
    userId: string,
    sessionId: string,
    sessionLevel: SessionLevel,
    refreshToken: string,
    transport: TokenTransport,
  ): Promise<IssuedAuthentication> {
    const access = await this.accessTokens.issue({
      userId,
      sessionId,
      sessionLevel,
    });
    return {
      response: {
        accessToken: access.token,
        expiresIn: access.expiresIn,
        sessionLevel,
        identityVerified: sessionLevel === SessionLevel.FULL,
        ...(transport === TokenTransport.NATIVE ? { refreshToken } : {}),
      },
      refreshToken,
      csrfToken: this.digests.requestContext(refreshToken),
      transport,
    };
  }

  private async applyLoginRateLimit(
    ipDigest: string,
    emailDigest: string,
    deviceDigest: string,
  ): Promise<void> {
    try {
      await this.rateLimiter.assertLoginAllowed({
        ipDigest,
        emailDigest,
        deviceDigest,
      });
    } catch (error) {
      if (error instanceof AuthenticationRateLimitError) {
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
        message: 'Authentication is temporarily unavailable.',
      });
    }
  }

  private async applyRefreshRateLimit(tokenDigest: string): Promise<void> {
    try {
      await this.rateLimiter.assertRefreshAllowed(tokenDigest);
    } catch (error) {
      if (error instanceof AuthenticationRateLimitError) {
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
        message: 'Authentication is temporarily unavailable.',
      });
    }
  }

  private async recordFailedCredential(
    userId: string,
    credentialId: string,
    failedCount: number,
    correlationId: string,
    ipHash: string,
  ): Promise<void> {
    const nextCount = failedCount + 1;
    const threshold = this.config.get('LOGIN_LOCK_THRESHOLD', { infer: true });
    await this.database.$transaction(async (transaction) => {
      await transaction.userCredential.update({
        where: { id: credentialId },
        data: {
          failedLoginCount: { increment: 1 },
          ...(nextCount >= threshold
            ? {
                lockedUntil: new Date(
                  Date.now() +
                    this.config.get('LOGIN_LOCK_SECONDS', { infer: true }) *
                      1_000,
                ),
              }
            : {}),
        },
      });
      await transaction.authSecurityEvent.create({
        data: {
          userId,
          eventType: AuthSecurityEventType.LOGIN_FAILED,
          severity: SecurityEventSeverity.WARNING,
          outcome: SecurityEventOutcome.FAILURE,
          reasonCode: 'INVALID_CREDENTIALS',
          correlationId,
          ipHash,
        },
      });
    });
  }

  private async writeLoginFailure(
    correlationId: string,
    ipHash: string,
    userId?: string,
  ): Promise<void> {
    try {
      await this.securityEvents.write({
        userId,
        eventType: AuthSecurityEventType.LOGIN_FAILED,
        severity: SecurityEventSeverity.WARNING,
        outcome: SecurityEventOutcome.FAILURE,
        reasonCode: 'INVALID_CREDENTIALS',
        correlationId,
        ipHash,
      });
    } catch {
      // Audit failure must not alter generic credential behavior.
    }
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: 'The email or password is invalid.',
    });
  }

  private invalidRefresh(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'REFRESH_TOKEN_INVALID',
      message: 'The refresh token is invalid or unavailable.',
    });
  }
}
