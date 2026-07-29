import {
  createPrivateKey,
  createPublicKey,
  randomUUID,
  sign,
  verify,
} from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionLevel } from '@mucyora/db';

import { AuthEnvironment } from '../../config/environment.validation';
import { parsePreviousSigningKeys } from '../../config/environment.validation';

export interface AccessTokenClaims {
  iss: string;
  aud: string[];
  sub: string;
  sid: string;
  jti: string;
  sessionLevel: SessionLevel;
  identityVerified: boolean;
  emailVerified: true;
  tokenType: 'ACCESS';
  iat: number;
  exp: number;
}

@Injectable()
export class AccessTokenService {
  private readonly privateKey;
  private readonly publicKey;
  private readonly verificationKeys: Map<
    string,
    ReturnType<typeof createPublicKey>
  >;
  private readonly keyId: string;
  private readonly issuer: string;
  private readonly audiences: string[];

  constructor(private readonly config: ConfigService<AuthEnvironment, true>) {
    this.privateKey = createPrivateKey(
      config.get('MUCYORA_AUTH_SIGNING_PRIVATE_KEY', { infer: true }),
    );
    this.publicKey = createPublicKey(
      config.get('MUCYORA_AUTH_SIGNING_PUBLIC_KEY', { infer: true }),
    );
    this.keyId = config.get('MUCYORA_AUTH_SIGNING_KEY_ID', { infer: true });
    this.verificationKeys = new Map([[this.keyId, this.publicKey]]);
    for (const previous of parsePreviousSigningKeys(
      config.get('MUCYORA_AUTH_PREVIOUS_SIGNING_PUBLIC_KEYS_JSON', {
        infer: true,
      }),
      this.keyId,
    )) {
      this.verificationKeys.set(
        previous.keyId,
        createPublicKey(previous.publicKey),
      );
    }
    this.issuer = config.get('MUCYORA_AUTH_ISSUER', { infer: true });
    this.audiences = config
      .get('MUCYORA_AUTH_ACCESS_AUDIENCES', { infer: true })
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  issue(input: {
    userId: string;
    sessionId: string;
    sessionLevel: SessionLevel;
  }): { token: string; expiresIn: number } {
    const now = Math.floor(Date.now() / 1_000);
    const expiresIn = this.config.get(
      input.sessionLevel === SessionLevel.LIMITED
        ? 'LIMITED_ACCESS_TOKEN_TTL_SECONDS'
        : 'ACCESS_TOKEN_TTL_SECONDS',
      { infer: true },
    );
    const header = encodeJson({
      alg: 'RS256',
      kid: this.keyId,
      typ: 'JWT',
    });
    const claims: AccessTokenClaims = {
      iss: this.issuer,
      aud: this.audiences,
      sub: input.userId,
      sid: input.sessionId,
      jti: randomUUID(),
      sessionLevel: input.sessionLevel,
      identityVerified: input.sessionLevel === SessionLevel.FULL,
      emailVerified: true,
      tokenType: 'ACCESS',
      iat: now,
      exp: now + expiresIn,
    };
    const payload = encodeJson(claims);
    const signingInput = `${header}.${payload}`;
    const signature = sign(
      'RSA-SHA256',
      Buffer.from(signingInput, 'ascii'),
      this.privateKey,
    ).toString('base64url');

    return { token: `${signingInput}.${signature}`, expiresIn };
  }

  verify(token: string): AccessTokenClaims {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Malformed token');
      }
      const [encodedHeader, encodedPayload, encodedSignature] = parts;
      const header = decodeJson(encodedHeader) as Record<string, unknown>;
      const claims = decodeJson(encodedPayload) as AccessTokenClaims;
      const verificationKey =
        typeof header.kid === 'string'
          ? this.verificationKeys.get(header.kid)
          : undefined;
      const validSignature = verify(
        'RSA-SHA256',
        Buffer.from(`${encodedHeader}.${encodedPayload}`, 'ascii'),
        verificationKey ?? this.publicKey,
        Buffer.from(encodedSignature, 'base64url'),
      );
      const now = Math.floor(Date.now() / 1_000);
      if (
        !validSignature ||
        !verificationKey ||
        header.alg !== 'RS256' ||
        claims.iss !== this.issuer ||
        claims.tokenType !== 'ACCESS' ||
        claims.exp <= now ||
        !claims.aud.some((audience) => this.audiences.includes(audience)) ||
        !Object.values(SessionLevel).includes(claims.sessionLevel)
      ) {
        throw new Error('Invalid token');
      }
      return claims;
    } catch {
      throw new UnauthorizedException({
        code: 'ACCESS_TOKEN_INVALID',
        message: 'Authentication is required.',
      });
    }
  }

  jwks(): { keys: Array<Record<string, unknown>> } {
    return {
      keys: [...this.verificationKeys.entries()].map(([keyId, publicKey]) => ({
        ...publicKey.export({ format: 'jwk' }),
        kid: keyId,
        alg: 'RS256',
        use: 'sig',
      })),
    };
  }
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeJson(value: string): unknown {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}
