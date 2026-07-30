import {
  createPrivateKey,
  createPublicKey,
  randomUUID,
  sign,
  verify,
} from 'node:crypto';
import { KMSClient, SignCommand } from '@aws-sdk/client-kms';
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
  private readonly kms: KMSClient | null;
  private readonly publicKey;
  private readonly verificationKeys: Map<
    string,
    ReturnType<typeof createPublicKey>
  >;
  private readonly keyId: string;
  private readonly issuer: string;
  private readonly audiences: string[];

  constructor(private readonly config: ConfigService<AuthEnvironment, true>) {
    const provider = config.get('MUCYORA_AUTH_SIGNING_PROVIDER', {
      infer: true,
    });
    this.privateKey =
      provider === 'SOFTWARE_PEM'
        ? createPrivateKey(
            config.get('MUCYORA_AUTH_SIGNING_PRIVATE_KEY', { infer: true }),
          )
        : null;
    this.kms =
      provider === 'AWS_KMS'
        ? new KMSClient({
            region: config.get('AWS_REGION', { infer: true }),
          })
        : null;
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

  async issue(input: {
    userId: string;
    sessionId: string;
    sessionLevel: SessionLevel;
  }): Promise<{ token: string; expiresIn: number }> {
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
    const signingBytes = Buffer.from(signingInput, 'ascii');
    const signature = this.kms
      ? Buffer.from(
          (
            await this.kms.send(
              new SignCommand({
                KeyId: this.config.get('MUCYORA_AUTH_KMS_KEY_ID', {
                  infer: true,
                }),
                Message: signingBytes,
                MessageType: 'RAW',
                SigningAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256',
              }),
            )
          ).Signature ?? new Uint8Array(),
        ).toString('base64url')
      : sign('RSA-SHA256', signingBytes, this.privateKey!).toString(
          'base64url',
        );
    if (!signature) {
      throw new Error('Signing provider returned an empty signature');
    }

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
