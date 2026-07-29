import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuthSecurityEventType,
  SecurityEventOutcome,
  SecurityEventSeverity,
  UserAccountStatus,
} from '@mucyora/db';

import { DatabaseService } from '../../common/database/database.service';
import { IdentityEncryptionService } from '../../common/security/identity-encryption.service';
import { KeyedDigestService } from '../../common/security/keyed-digest.service';
import { normalizeEmail } from '../../common/security/normalization';
import { TokenService } from '../../common/security/token.service';
import { AuthEnvironment } from '../../config/environment.validation';
import {
  AccountCreationRateLimitError,
  AccountCreationRateLimiter,
} from '../registration/account-creation-rate-limiter.service';
import {
  ResendEmailVerificationDto,
  ResendEmailVerificationResponseDto,
  VerifyEmailDto,
  VerifyEmailResponseDto,
} from './dto/email-verification.dto';

export interface EmailVerificationRequestContext {
  correlationId: string;
  ipAddress: string;
}

@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService<AuthEnvironment, true>,
    private readonly tokens: TokenService,
    private readonly digests: KeyedDigestService,
    private readonly encryption: IdentityEncryptionService,
    private readonly rateLimiter: AccountCreationRateLimiter,
  ) {}

  async verify(
    input: VerifyEmailDto,
    context: EmailVerificationRequestContext,
  ): Promise<VerifyEmailResponseDto> {
    const tokenDigest = this.tokens.digest(input.token);
    const now = new Date();

    const result = await this.database.$transaction(async (transaction) => {
      const token = await transaction.emailVerificationToken.findUnique({
        where: { tokenDigest },
        select: {
          id: true,
          userId: true,
          expiresAt: true,
          usedAt: true,
          supersededAt: true,
          user: {
            select: { emailNormalized: true },
          },
        },
      });
      if (
        !token ||
        token.usedAt ||
        token.supersededAt ||
        token.expiresAt.getTime() <= now.getTime()
      ) {
        throw this.invalidToken();
      }

      const consumed = await transaction.emailVerificationToken.updateMany({
        where: {
          id: token.id,
          usedAt: null,
          supersededAt: null,
          expiresAt: { gt: now },
        },
        data: {
          used: true,
          usedAt: now,
        },
      });
      if (consumed.count !== 1) {
        throw this.invalidToken();
      }

      const activated = await transaction.user.updateMany({
        where: {
          id: token.userId,
          accountStatus: UserAccountStatus.PENDING_EMAIL_VERIFICATION,
          emailVerifiedAt: null,
        },
        data: {
          emailVerifiedAt: now,
          accountStatus: UserAccountStatus.ACTIVE,
          isVerified: true,
          isActive: true,
          version: { increment: 1 },
        },
      });
      if (activated.count !== 1) {
        throw this.invalidToken();
      }
      await transaction.authSecurityEvent.create({
        data: {
          userId: token.userId,
          eventType: AuthSecurityEventType.EMAIL_VERIFIED,
          severity: SecurityEventSeverity.INFO,
          outcome: SecurityEventOutcome.SUCCESS,
          correlationId: context.correlationId,
          ipHash: this.digests.requestContext(context.ipAddress),
        },
      });
      await transaction.outboxEvent.create({
        data: {
          aggregateType: 'USER',
          aggregateId: token.userId,
          eventType: 'WELCOME_NEXT_STEP',
          payload: {
            recipient: token.user.emailNormalized,
          },
        },
      });

      return true;
    });

    if (!result) {
      throw this.invalidToken();
    }
    return {
      status: 'verified',
      nextAction: 'IDENTITY_VERIFICATION',
    };
  }

  async resend(
    input: ResendEmailVerificationDto,
    context: EmailVerificationRequestContext,
  ): Promise<ResendEmailVerificationResponseDto> {
    const emailNormalized = normalizeEmail(input.email);
    const ipHash = this.digests.requestContext(context.ipAddress);
    const emailHash = this.digests.requestContext(emailNormalized);

    try {
      await this.rateLimiter.assertResendAllowed(ipHash, emailHash);
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
        message: 'The request is temporarily unavailable.',
      });
    }

    const generated = this.tokens.generate(32);
    const encryptedToken = this.encryption.seal(
      generated.token,
      'email-verification-token',
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
      user &&
      !user.emailVerifiedAt &&
      user.accountStatus === UserAccountStatus.PENDING_EMAIL_VERIFICATION
    ) {
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() +
          this.config.get('EMAIL_TOKEN_TTL_SECONDS', { infer: true }) * 1_000,
      );
      await this.database.$transaction(async (transaction) => {
        await transaction.emailVerificationToken.updateMany({
          where: {
            userId: user.id,
            usedAt: null,
            supersededAt: null,
            expiresAt: { gt: now },
          },
          data: { supersededAt: now },
        });
        await transaction.emailVerificationToken.create({
          data: {
            userId: user.id,
            tokenDigest: generated.digest,
            expiresAt,
          },
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'USER',
            aggregateId: user.id,
            eventType: 'EMAIL_VERIFICATION_REQUESTED',
            payload: {
              recipient: user.emailNormalized,
              tokenEncrypted: encryptedToken,
            },
          },
        });
        await transaction.authSecurityEvent.create({
          data: {
            userId: user.id,
            eventType: AuthSecurityEventType.EMAIL_VERIFICATION_REQUESTED,
            severity: SecurityEventSeverity.INFO,
            outcome: SecurityEventOutcome.SUCCESS,
            correlationId: context.correlationId,
            ipHash,
          },
        });
      });
    }

    return { status: 'accepted' };
  }

  private invalidToken(): BadRequestException {
    return new BadRequestException({
      code: 'EMAIL_VERIFICATION_INVALID',
      message: 'The email verification request is invalid or unavailable.',
    });
  }
}
