import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decodeKeyMaterial } from './key-material';

const ALGORITHM = 'aes-256-gcm';
const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const FORMAT = 'gcm';
export const IDENTITY_NONCE_FACTORY = Symbol('IDENTITY_NONCE_FACTORY');
export type IdentityNonceFactory = (size: number) => Buffer;
export const defaultIdentityNonceFactory: IdentityNonceFactory = randomBytes;

export type IdentityEncryptionPurpose =
  | 'rwanda-nid'
  | 'citizen-snapshot'
  | 'registration-challenge-token'
  | 'verification-media-reference';

export interface IdentityEncryptionEnvelope {
  format: typeof FORMAT;
  version: string;
  nonce: string;
  ciphertext: string;
  authTag: string;
}

export interface IdentityEncryptionProvider {
  encrypt(
    plaintext: string,
    purpose: IdentityEncryptionPurpose,
  ): IdentityEncryptionEnvelope;
  decrypt(
    envelope: IdentityEncryptionEnvelope,
    purpose: IdentityEncryptionPurpose,
  ): string;
}

@Injectable()
export class IdentityEncryptionService implements IdentityEncryptionProvider {
  private readonly key: Buffer;
  private readonly version: string;

  constructor(
    config: ConfigService,
    @Inject(IDENTITY_NONCE_FACTORY)
    private readonly nonceFactory: IdentityNonceFactory,
  ) {
    const key = decodeKeyMaterial(
      config.getOrThrow<string>('IDENTITY_ENCRYPTION_SECRET'),
      'IDENTITY_ENCRYPTION_SECRET',
      32,
    );
    if (key.length !== 32) {
      throw new Error(
        'IDENTITY_ENCRYPTION_SECRET must decode to exactly 32 bytes.',
      );
    }
    this.key = key;
    this.version = config.getOrThrow<string>('IDENTITY_ENCRYPTION_KEY_VERSION');
  }

  encrypt(
    plaintext: string,
    purpose: IdentityEncryptionPurpose,
  ): IdentityEncryptionEnvelope {
    const nonce = this.nonceFactory(NONCE_LENGTH);
    if (nonce.length !== NONCE_LENGTH) {
      throw new Error('Identity encryption nonce must be 12 bytes.');
    }

    const cipher = createCipheriv(ALGORITHM, this.key, nonce, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    cipher.setAAD(this.additionalData(purpose));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    return {
      format: FORMAT,
      version: this.version,
      nonce: nonce.toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
      authTag: cipher.getAuthTag().toString('base64url'),
    };
  }

  decrypt(
    envelope: IdentityEncryptionEnvelope,
    purpose: IdentityEncryptionPurpose,
  ): string {
    if (envelope.format !== FORMAT || envelope.version !== this.version) {
      throw new Error('Unsupported identity encryption envelope.');
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(envelope.nonce, 'base64url'),
      { authTagLength: AUTH_TAG_LENGTH },
    );
    decipher.setAAD(this.additionalData(purpose));
    decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  seal(plaintext: string, purpose: IdentityEncryptionPurpose): string {
    return JSON.stringify(this.encrypt(plaintext, purpose));
  }

  open(serializedEnvelope: string, purpose: IdentityEncryptionPurpose): string {
    return this.decrypt(parseEnvelope(serializedEnvelope), purpose);
  }

  private additionalData(purpose: IdentityEncryptionPurpose): Buffer {
    return Buffer.from(
      `mucyora-auth:${FORMAT}:${this.version}:${purpose}`,
      'utf8',
    );
  }
}

function parseEnvelope(value: string): IdentityEncryptionEnvelope {
  let candidate: unknown;
  try {
    candidate = JSON.parse(value);
  } catch {
    throw new Error('Invalid identity encryption envelope.');
  }

  if (
    !candidate ||
    typeof candidate !== 'object' ||
    !('format' in candidate) ||
    candidate.format !== FORMAT ||
    !('version' in candidate) ||
    typeof candidate.version !== 'string' ||
    !('nonce' in candidate) ||
    typeof candidate.nonce !== 'string' ||
    !('ciphertext' in candidate) ||
    typeof candidate.ciphertext !== 'string' ||
    !('authTag' in candidate) ||
    typeof candidate.authTag !== 'string'
  ) {
    throw new Error('Invalid identity encryption envelope.');
  }

  return {
    format: FORMAT,
    version: candidate.version,
    nonce: candidate.nonce,
    ciphertext: candidate.ciphertext,
    authTag: candidate.authTag,
  };
}
