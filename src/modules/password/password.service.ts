import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuthSecurityEventType,
  SecurityEventOutcome,
  SecurityEventSeverity,
  SessionStatus,
  UserAccountStatus,
  Prisma,
} from '@mucyora/db';

import { DatabaseService } from '../../common/database/database.service';
import { IdentityEncryptionService } from '../../common/security/identity-encryption.service';
import { KeyedDigestService } from '../../common/security/keyed-digest.service';
import { normalizeEmail } from '../../common/security/normalization';
import { PasswordPolicyService } from '../../common/security/password-policy.service';
import { TokenService } from '../../common/security/token.service';
import { AuthEnvironment } from '../../config/environment.validation';
import type { AccessTokenClaims } from '../auth/access-token.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  PasswordChangedDto,
  PasswordRequestAcceptedDto,
  ResetPasswordDto,
} from './dto/password.dto';
import {
  PasswordRateLimitError,
  PasswordRateLimiter,
} from './password-rate-limiter.service';

export interface PasswordRequestContext {
  correlationId: string;
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class PasswordService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService<AuthEnvironment, true>,
    private readonly tokens: TokenService,
    private readonly digests: KeyedDigestService,
    private readonly encryption: IdentityEncryptionService,
    private readonly passwords: PasswordPolicyService,
    private readonly rateLimiter: PasswordRateLimiter,
  ) {}

  async forgot(
    input: ForgotPasswordDto,
    context: PasswordRequestContext,
  ): Promise<PasswordRequestAcceptedDto> {
    const emailNormalized = normalizeEmail(input.email);
    const ipHash = this.digests.requestContext(context.ipAddress);
    const emailHash = this.digests.requestContext(emailNormalized);
    await this.limit(() =>
      this.rateLimiter.assertResetRequestAllowed(ipHash, emailHash),
    );

    const generated = this.tokens.generate(32);
    const encryptedToken = this.encryption.seal(
      generated.token,
      'password-reset-token',
    );
    const user = await this.database.user.findUnique({
      where: { emailNormalized },
      select: {
        id: true,
        emailNormalized: true,
        emailVerifiedAt: true,
        accountStatus: true,
      },
    });

    if (
      user?.emailVerifiedAt &&
      user.accountStatus === UserAccountStatus.ACTIVE
    ) {
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() +
          this.config.get('PASSWORD_RESET_TOKEN_TTL_SECONDS', {
            infer: true,
          }) *
            1_000,
      );
      await this.database.$transaction(async (transaction) => {
        await transaction.passwordResetRequest.updateMany({
          where: {
            userId: user.id,
            usedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: { revokedAt: now },
        });
        await transaction.passwordResetRequest.create({
          data: {
            userId: user.id,
            tokenDigest: generated.digest,
            expiresAt,
            requestedIpHash: ipHash,
          },
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'USER',
            aggregateId: user.id,
            eventType: 'PASSWORD_RESET_REQUESTED',
            payload: {
              recipient: user.emailNormalized,
              tokenEncrypted: encryptedToken,
            },
          },
        });
        await transaction.authSecurityEvent.create({
          data: {
            userId: user.id,
            eventType: AuthSecurityEventType.PASSWORD_RESET_REQUESTED,
            severity: SecurityEventSeverity.INFO,
            outcome: SecurityEventOutcome.SUCCESS,
            correlationId: context.correlationId,
            ipHash,
            userAgentHash: this.digests.requestContext(context.userAgent),
          },
        });
      });
    }

    return { status: 'accepted' };
  }

  async reset(
    input: ResetPasswordDto,
    context: PasswordRequestContext,
  ): Promise<PasswordChangedDto> {
    const tokenDigest = this.tokens.digest(input.token);
    const ipHash = this.digests.requestContext(context.ipAddress);
    await this.limit(() =>
      this.rateLimiter.assertResetAllowed(ipHash, tokenDigest),
    );

    const request = await this.database.passwordResetRequest.findUnique({
      where: { tokenDigest },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
        revokedAt: true,
        user: {
          select: {
            emailNormalized: true,
            accountStatus: true,
          },
        },
      },
    });
    const now = new Date();
    if (
      !request ||
      request.usedAt ||
      request.revokedAt ||
      request.expiresAt.getTime() <= now.getTime() ||
      request.user.accountStatus !== UserAccountStatus.ACTIVE
    ) {
      throw this.invalidReset();
    }

    const passwordHash = await this.passwords.hash(
      input.newPassword,
      request.user.emailNormalized,
    );
    await this.database.$transaction(async (transaction) => {
      const consumed = await transaction.passwordResetRequest.updateMany({
        where: {
          id: request.id,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) {
        throw this.invalidReset();
      }
      await transaction.userCredential.update({
        where: { userId: request.userId },
        data: {
          passwordHash,
          passwordAlgorithm: 'argon2id',
          passwordChangedAt: now,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      await transaction.passwordResetRequest.updateMany({
        where: {
          userId: request.userId,
          id: { not: request.id },
          usedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      await this.revokeSessions(transaction, request.userId, now);
      await this.writePasswordChangedSideEffects(
        transaction,
        request.userId,
        request.user.emailNormalized,
        context,
        ipHash,
        'PASSWORD_RESET',
      );
    });

    return { status: 'changed' };
  }

  async change(
    claims: AccessTokenClaims,
    input: ChangePasswordDto,
    context: PasswordRequestContext,
  ): Promise<PasswordChangedDto> {
    const ipHash = this.digests.requestContext(context.ipAddress);
    await this.limit(() =>
      this.rateLimiter.assertChangeAllowed(ipHash, claims.sub),
    );
    const credential = await this.database.userCredential.findUnique({
      where: { userId: claims.sub },
      select: {
        passwordHash: true,
        user: {
          select: {
            emailNormalized: true,
            accountStatus: true,
          },
        },
      },
    });
    if (
      !credential ||
      credential.user.accountStatus !== UserAccountStatus.ACTIVE ||
      !(await this.passwords.verify(
        credential.passwordHash,
        input.currentPassword,
      ))
    ) {
      throw this.invalidCurrentPassword();
    }
    if (
      await this.passwords.verify(credential.passwordHash, input.newPassword)
    ) {
      throw new BadRequestException({
        code: 'PASSWORD_REUSE_NOT_ALLOWED',
        message:
          'Choose a password that is different from the current password.',
      });
    }

    const passwordHash = await this.passwords.hash(
      input.newPassword,
      credential.user.emailNormalized,
    );
    const now = new Date();
    await this.database.$transaction(async (transaction) => {
      const changed = await transaction.userCredential.updateMany({
        where: {
          userId: claims.sub,
          passwordHash: credential.passwordHash,
        },
        data: {
          passwordHash,
          passwordAlgorithm: 'argon2id',
          passwordChangedAt: now,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      if (changed.count !== 1) {
        throw new HttpException(
          {
            code: 'PASSWORD_CHANGE_CONFLICT',
            message: 'The password changed concurrently. Sign in again.',
          },
          HttpStatus.CONFLICT,
        );
      }
      await transaction.passwordResetRequest.updateMany({
        where: {
          userId: claims.sub,
          usedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      await this.revokeSessions(transaction, claims.sub, now);
      await this.writePasswordChangedSideEffects(
        transaction,
        claims.sub,
        credential.user.emailNormalized,
        context,
        ipHash,
        'AUTHENTICATED_CHANGE',
      );
    });

    return { status: 'changed' };
  }

  private async revokeSessions(
    transaction: Prisma.TransactionClient,
    userId: string,
    now: Date,
  ): Promise<void> {
    await transaction.authSession.updateMany({
      where: { userId, status: SessionStatus.ACTIVE },
      data: {
        status: SessionStatus.REVOKED,
        revokedAt: now,
        revocationReason: 'PASSWORD_CHANGED',
        version: { increment: 1 },
      },
    });
    await transaction.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: {
        revoked: true,
        revokedAt: now,
      },
    });
  }

  private async writePasswordChangedSideEffects(
    transaction: Prisma.TransactionClient,
    userId: string,
    recipient: string,
    context: PasswordRequestContext,
    ipHash: string,
    reasonCode: string,
  ): Promise<void> {
    await transaction.outboxEvent.create({
      data: {
        aggregateType: 'USER',
        aggregateId: userId,
        eventType: 'PASSWORD_CHANGED_NOTIFICATION',
        payload: { recipient },
      },
    });
    await transaction.authSecurityEvent.create({
      data: {
        userId,
        eventType: AuthSecurityEventType.PASSWORD_CHANGED,
        severity: SecurityEventSeverity.WARNING,
        outcome: SecurityEventOutcome.SUCCESS,
        reasonCode,
        correlationId: context.correlationId,
        ipHash,
        userAgentHash: this.digests.requestContext(context.userAgent),
      },
    });
  }

  private async limit(operation: () => Promise<void>): Promise<void> {
    try {
      await operation();
    } catch (error) {
      if (error instanceof PasswordRateLimitError) {
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
        message: 'The request is temporarily unavailable.',
      });
    }
  }

  private invalidReset(): BadRequestException {
    return new BadRequestException({
      code: 'PASSWORD_RESET_INVALID',
      message: 'The password reset request is invalid or unavailable.',
    });
  }

  private invalidCurrentPassword(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'CURRENT_PASSWORD_INVALID',
      message: 'The current password is invalid.',
    });
  }
}
