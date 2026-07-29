import { generateKeyPairSync, sign } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { SessionLevel } from '@mucyora/db';

import { AccessTokenService } from './access-token.service';

describe('AccessTokenService', () => {
  const keys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const previousKeys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const service = new AccessTokenService(
    new ConfigService({
      MUCYORA_AUTH_SIGNING_PRIVATE_KEY: keys.privateKey,
      MUCYORA_AUTH_SIGNING_PUBLIC_KEY: keys.publicKey,
      MUCYORA_AUTH_SIGNING_KEY_ID: 'test-key-2026',
      MUCYORA_AUTH_PREVIOUS_SIGNING_PUBLIC_KEYS_JSON: JSON.stringify([
        { keyId: 'test-key-2025', publicKey: previousKeys.publicKey },
      ]),
      MUCYORA_AUTH_ISSUER: 'https://auth.mucyora.example',
      MUCYORA_AUTH_ACCESS_AUDIENCES: 'mucyora-user,mucyora-signature',
      ACCESS_TOKEN_TTL_SECONDS: 900,
      LIMITED_ACCESS_TOKEN_TTL_SECONDS: 600,
    }),
  );

  it('issues and verifies minimized asymmetric full-session claims', () => {
    const issued = service.issue({
      userId: 'user-1',
      sessionId: 'session-1',
      sessionLevel: SessionLevel.FULL,
    });
    const claims = service.verify(issued.token);

    expect(claims).toMatchObject({
      sub: 'user-1',
      sid: 'session-1',
      sessionLevel: SessionLevel.FULL,
      identityVerified: true,
      emailVerified: true,
      tokenType: 'ACCESS',
    });
    expect(claims).not.toHaveProperty('email');
    expect(JSON.stringify(claims)).not.toContain('nid');
    expect(JSON.stringify(claims)).not.toContain('dateOfBirth');
  });

  it('issues limited claims and rejects tampering', () => {
    const issued = service.issue({
      userId: 'user-1',
      sessionId: 'session-1',
      sessionLevel: SessionLevel.LIMITED,
    });
    expect(service.verify(issued.token).identityVerified).toBe(false);

    const parts = issued.token.split('.');
    parts[2] = `${parts[2][0] === 'A' ? 'B' : 'A'}${parts[2].slice(1)}`;
    const tampered = parts.join('.');
    expect(() => service.verify(tampered)).toThrow(
      'Authentication is required',
    );
  });

  it('exports active and overlap public RSA verification material', () => {
    const jwks = service.jwks();
    expect(jwks.keys[0]).toMatchObject({
      kty: 'RSA',
      kid: 'test-key-2026',
      alg: 'RS256',
      use: 'sig',
    });
    expect(JSON.stringify(jwks)).not.toContain('private');
    expect(jwks.keys[0]).not.toHaveProperty('d');
    expect(jwks.keys[1]).toMatchObject({
      kty: 'RSA',
      kid: 'test-key-2025',
      alg: 'RS256',
      use: 'sig',
    });
    expect(jwks.keys[1]).not.toHaveProperty('d');
  });

  it('verifies an in-flight token signed by the overlap key', () => {
    const now = Math.floor(Date.now() / 1_000);
    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', kid: 'test-key-2025', typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: 'https://auth.mucyora.example',
        aud: ['mucyora-user'],
        sub: 'user-1',
        sid: 'session-1',
        jti: 'rotation-drill-token',
        sessionLevel: SessionLevel.FULL,
        identityVerified: true,
        emailVerified: true,
        tokenType: 'ACCESS',
        iat: now,
        exp: now + 300,
      }),
    ).toString('base64url');
    const input = `${header}.${payload}`;
    const signature = sign(
      'RSA-SHA256',
      Buffer.from(input, 'ascii'),
      previousKeys.privateKey,
    ).toString('base64url');

    expect(service.verify(`${input}.${signature}`).jti).toBe(
      'rotation-drill-token',
    );
  });
});
