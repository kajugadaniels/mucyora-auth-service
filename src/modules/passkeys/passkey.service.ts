import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { randomUUID } from 'node:crypto';
import {
  IdentityVerificationStatus,
  SessionLevel,
  SessionStatus,
} from '@mucyora/db';
import type Redis from 'ioredis';

import { DatabaseService } from '../../common/database/database.service';
import { TokenService } from '../../common/security/token.service';
import { normalizeEmail } from '../../common/security/normalization';
import { KeyedDigestService } from '../../common/security/keyed-digest.service';
import { AuthEnvironment } from '../../config/environment.validation';
import { ensureRedisConnected } from '../../integrations/redis/redis-connection';
import { REDIS_CLIENT } from '../../integrations/redis/redis.module';
import type { AccessTokenClaims } from '../auth/access-token.service';
import { AccessTokenService } from '../auth/access-token.service';
import { AuthTokenResponseDto, TokenTransport } from '../auth/dto/auth.dto';
import type { IssuedAuthentication } from '../auth/authentication.service';
import {
  PasskeyRegistrationOptionsDto,
  PasskeyRegistrationVerifyDto,
  ConsumeRecoveryCodeDto,
  PasskeyAuthenticationOptionsDto,
  PasskeyAuthenticationVerifyDto,
} from './dto/passkey.dto';

@Injectable()
export class PasskeyService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService<AuthEnvironment, true>,
    private readonly tokens: TokenService,
    private readonly accessTokens: AccessTokenService,
    private readonly digests: KeyedDigestService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async authenticationOptions(input: PasskeyAuthenticationOptionsDto) {
    const user = await this.database.user.findUnique({
      where: { emailNormalized: normalizeEmail(input.email) },
      select: {
        id: true,
        passkeyCredentials: {
          where: { revokedAt: null },
          select: { credentialId: true, transports: true },
          take: 20,
        },
      },
    });
    const options = await generateAuthenticationOptions({
      rpID: this.config.get('PASSKEY_RP_ID', { infer: true }),
      userVerification: 'required',
      allowCredentials:
        user?.passkeyCredentials.map((credential) => ({
          id: credential.credentialId,
          transports: credential.transports as never[],
        })) ?? [],
    });
    const flowId = this.tokens.generate(32).token;
    await ensureRedisConnected(this.redis);
    await this.redis.set(
      this.authenticationKey(flowId),
      JSON.stringify({
        challenge: options.challenge,
        userId: user?.id ?? null,
      }),
      'EX',
      this.config.get('PASSKEY_CHALLENGE_TTL_SECONDS', { infer: true }),
    );
    return { flowId, options };
  }

  async verifyAuthentication(
    input: PasskeyAuthenticationVerifyDto,
    context: { ipAddress: string; userAgent: string },
  ): Promise<IssuedAuthentication> {
    await ensureRedisConnected(this.redis);
    const encoded = await this.redis.getdel(
      this.authenticationKey(input.flowId),
    );
    if (!encoded) throw this.invalidAuthentication();
    const state = JSON.parse(encoded) as {
      challenge: string;
      userId: string | null;
    };
    if (!state.userId) throw this.invalidAuthentication();
    const authenticationResponse =
      input.response as unknown as AuthenticationResponseJSON;
    const credential = await this.database.passkeyCredential.findFirst({
      where: {
        userId: state.userId,
        credentialId: authenticationResponse.id,
        revokedAt: null,
      },
    });
    if (!credential) throw this.invalidAuthentication();
    const verification = await verifyAuthenticationResponse({
      response: authenticationResponse,
      expectedChallenge: state.challenge,
      expectedOrigin: this.config
        .get('PASSKEY_ALLOWED_ORIGINS', { infer: true })
        .split(',')
        .map((origin) => origin.trim()),
      expectedRPID: this.config.get('PASSKEY_RP_ID', { infer: true }),
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(credential.publicKey),
        counter: Number(credential.counter),
        transports: credential.transports as never[],
      },
      requireUserVerification: true,
    });
    if (!verification.verified) throw this.invalidAuthentication();
    const user = await this.database.user.findUniqueOrThrow({
      where: { id: state.userId },
      select: { identityVerificationStatus: true },
    });
    const sessionLevel =
      user.identityVerificationStatus === IdentityVerificationStatus.VERIFIED
        ? SessionLevel.FULL
        : SessionLevel.LIMITED;
    const refresh = this.tokens.generate(48);
    const expiresAt = new Date(
      Date.now() +
        this.config.get('REFRESH_TOKEN_TTL_SECONDS', { infer: true }) * 1_000,
    );
    const session = await this.database.$transaction(async (transaction) => {
      await transaction.passkeyCredential.update({
        where: { id: credential.id },
        data: {
          counter: verification.authenticationInfo.newCounter,
          lastUsedAt: new Date(),
        },
      });
      const created = await transaction.authSession.create({
        data: {
          userId: state.userId!,
          sessionFamilyId: randomUUID(),
          sessionLevel,
          status: SessionStatus.ACTIVE,
          deviceId: input.deviceId,
          deviceLabel: input.deviceLabel,
          ipHash: this.digests.requestContext(context.ipAddress),
          userAgentHash: this.digests.requestContext(context.userAgent),
          expiresAt,
        },
        select: { id: true },
      });
      await transaction.refreshToken.create({
        data: {
          userId: state.userId!,
          sessionId: created.id,
          tokenDigest: refresh.digest,
          tokenType: sessionLevel.toLowerCase(),
          expiresAt,
        },
      });
      return created;
    });
    const access = await this.accessTokens.issue({
      userId: state.userId,
      sessionId: session.id,
      sessionLevel,
    });
    const response: AuthTokenResponseDto = {
      accessToken: access.token,
      expiresIn: access.expiresIn,
      sessionLevel,
      identityVerified: sessionLevel === SessionLevel.FULL,
      ...(input.transport === TokenTransport.NATIVE
        ? { refreshToken: refresh.token }
        : {}),
    };
    return {
      response,
      refreshToken: refresh.token,
      csrfToken: this.digests.requestContext(refresh.token),
      transport: input.transport,
    };
  }

  async registrationOptions(
    claims: AccessTokenClaims,
    input: PasskeyRegistrationOptionsDto,
  ) {
    const user = await this.database.user.findUniqueOrThrow({
      where: { id: claims.sub },
      select: {
        emailNormalized: true,
        citizenIdentity: { select: { surName: true, postNames: true } },
        passkeyCredentials: {
          where: { revokedAt: null },
          select: { credentialId: true, transports: true },
        },
      },
    });
    const options = await generateRegistrationOptions({
      rpName: this.config.get('PASSKEY_RP_NAME', { infer: true }),
      rpID: this.config.get('PASSKEY_RP_ID', { infer: true }),
      userID: Buffer.from(claims.sub),
      userName: user.emailNormalized,
      userDisplayName: user.citizenIdentity
        ? `${user.citizenIdentity.postNames} ${user.citizenIdentity.surName}`
        : 'MUCYORA user',
      attestationType: 'none',
      excludeCredentials: user.passkeyCredentials.map((credential) => ({
        id: credential.credentialId,
        transports: credential.transports as never[],
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required',
      },
    });
    await ensureRedisConnected(this.redis);
    await this.redis.set(
      this.challengeKey(claims.sub),
      options.challenge,
      'EX',
      this.config.get('PASSKEY_CHALLENGE_TTL_SECONDS', { infer: true }),
    );
    return { ...options, label: input.label };
  }

  async verifyRegistration(
    claims: AccessTokenClaims,
    input: PasskeyRegistrationVerifyDto,
  ) {
    await ensureRedisConnected(this.redis);
    const challenge = await this.redis.getdel(this.challengeKey(claims.sub));
    if (!challenge) throw this.invalid();
    const verification = await verifyRegistrationResponse({
      response: input.response as unknown as RegistrationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin: this.config
        .get('PASSKEY_ALLOWED_ORIGINS', { infer: true })
        .split(',')
        .map((origin) => origin.trim()),
      expectedRPID: this.config.get('PASSKEY_RP_ID', { infer: true }),
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo) {
      throw this.invalid();
    }
    const credential = verification.registrationInfo.credential;
    return this.database.passkeyCredential.create({
      data: {
        userId: claims.sub,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? [],
        deviceType: verification.registrationInfo.credentialDeviceType,
        backedUp: verification.registrationInfo.credentialBackedUp,
        label: input.label,
      },
      select: { id: true, label: true, createdAt: true },
    });
  }

  list(claims: AccessTokenClaims) {
    return this.database.passkeyCredential.findMany({
      where: { userId: claims.sub, revokedAt: null },
      select: {
        id: true,
        label: true,
        backedUp: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  revoke(claims: AccessTokenClaims, id: string) {
    return this.database.passkeyCredential.updateMany({
      where: { id, userId: claims.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async rotateRecoveryCodes(claims: AccessTokenClaims) {
    const generated = Array.from(
      { length: this.config.get('RECOVERY_CODE_COUNT', { infer: true }) },
      () => this.tokens.generate(16),
    );
    await this.database.$transaction(async (transaction) => {
      await transaction.accountRecoveryCode.updateMany({
        where: { userId: claims.sub, usedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await transaction.accountRecoveryCode.createMany({
        data: generated.map((code) => ({
          userId: claims.sub,
          codeDigest: code.digest,
        })),
      });
    });
    return { recoveryCodes: generated.map((code) => code.token) };
  }

  async consumeRecoveryCode(input: ConsumeRecoveryCodeDto) {
    const emailNormalized = normalizeEmail(input.email);
    const codeDigest = this.tokens.digest(input.recoveryCode);
    const reset = this.tokens.generate(32);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1_000);
    await this.database.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { emailNormalized },
        select: { id: true },
      });
      if (!user) throw this.invalidRecovery();
      const consumed = await transaction.accountRecoveryCode.updateMany({
        where: {
          userId: user.id,
          codeDigest,
          usedAt: null,
          revokedAt: null,
        },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) throw this.invalidRecovery();
      await transaction.passwordResetRequest.create({
        data: {
          userId: user.id,
          tokenDigest: reset.digest,
          expiresAt,
        },
      });
    });
    return { resetToken: reset.token, expiresAt };
  }

  private challengeKey(userId: string): string {
    return `${this.config.get('CACHE_PREFIX', { infer: true })}passkey:registration:${userId}`;
  }

  private authenticationKey(flowId: string): string {
    return `${this.config.get('CACHE_PREFIX', { infer: true })}passkey:authentication:${flowId}`;
  }

  private invalid(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'PASSKEY_REGISTRATION_INVALID',
      message: 'The passkey registration could not be verified.',
    });
  }

  private invalidRecovery(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'RECOVERY_CODE_INVALID',
      message: 'The recovery code is invalid or unavailable.',
    });
  }

  private invalidAuthentication(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'PASSKEY_AUTHENTICATION_INVALID',
      message: 'Passkey authentication failed.',
    });
  }
}
