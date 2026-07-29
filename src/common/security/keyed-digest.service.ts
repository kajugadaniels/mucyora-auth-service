import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { assertPurposeSeparatedKeys, decodeKeyMaterial } from './key-material';

type DigestPurpose = 'identity-lookup' | 'token' | 'request-context';

@Injectable()
export class KeyedDigestService {
  private readonly lookupKey: Buffer;
  private readonly tokenKey: Buffer;
  private readonly contextKey: Buffer;
  private readonly lookupVersion: string;

  constructor(config: ConfigService) {
    this.lookupKey = decodeKeyMaterial(
      config.getOrThrow<string>('IDENTITY_LOOKUP_HMAC_KEY'),
      'IDENTITY_LOOKUP_HMAC_KEY',
    );
    this.tokenKey = decodeKeyMaterial(
      config.getOrThrow<string>('TOKEN_DIGEST_HMAC_KEY'),
      'TOKEN_DIGEST_HMAC_KEY',
    );
    this.contextKey = decodeKeyMaterial(
      config.getOrThrow<string>('REQUEST_CONTEXT_HMAC_KEY'),
      'REQUEST_CONTEXT_HMAC_KEY',
    );
    this.lookupVersion = config.getOrThrow<string>(
      'IDENTITY_LOOKUP_KEY_VERSION',
    );

    assertPurposeSeparatedKeys([
      { name: 'IDENTITY_LOOKUP_HMAC_KEY', value: this.lookupKey },
      { name: 'TOKEN_DIGEST_HMAC_KEY', value: this.tokenKey },
      { name: 'REQUEST_CONTEXT_HMAC_KEY', value: this.contextKey },
    ]);
  }

  identityLookup(value: string): string {
    return `${this.lookupVersion}:${this.digest(
      'identity-lookup',
      value,
      this.lookupKey,
    )}`;
  }

  token(value: string): string {
    return this.digest('token', value, this.tokenKey);
  }

  requestContext(value: string): string {
    return this.digest('request-context', value, this.contextKey);
  }

  private digest(purpose: DigestPurpose, value: string, key: Buffer): string {
    return createHmac('sha256', key)
      .update(`mucyora-auth:${purpose}:`, 'utf8')
      .update(value, 'utf8')
      .digest('base64url');
  }
}
