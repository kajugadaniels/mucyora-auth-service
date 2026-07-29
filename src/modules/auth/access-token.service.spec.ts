import { generateKeyPairSync } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { SessionLevel } from '@mucyora/db';

import { AccessTokenService } from './access-token.service';

describe('AccessTokenService', () => {
  const keys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const service = new AccessTokenService(
    new ConfigService({
      MUCYORA_AUTH_SIGNING_PRIVATE_KEY: keys.privateKey,
      MUCYORA_AUTH_SIGNING_PUBLIC_KEY: keys.publicKey,
      MUCYORA_AUTH_SIGNING_KEY_ID: 'test-key-2026',
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

  it('exports only public RSA verification material', () => {
    const jwks = service.jwks();
    expect(jwks.keys[0]).toMatchObject({
      kty: 'RSA',
      kid: 'test-key-2026',
      alg: 'RS256',
      use: 'sig',
    });
    expect(JSON.stringify(jwks)).not.toContain('private');
    expect(jwks.keys[0]).not.toHaveProperty('d');
  });
});
