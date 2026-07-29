import { ConfigService } from '@nestjs/config';
import {
  IdentityEncryptionEnvelope,
  IdentityEncryptionService,
} from './identity-encryption.service';

describe('IdentityEncryptionService', () => {
  const nonce = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  const service = new IdentityEncryptionService(
    new ConfigService({
      IDENTITY_ENCRYPTION_KEY_VERSION: 'v1',
      IDENTITY_ENCRYPTION_SECRET: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    }),
    () => nonce,
  );

  it('matches the AES-256-GCM test vector and round trips', () => {
    const envelope = service.encrypt('synthetic-identifier', 'rwanda-nid');

    expect(envelope).toEqual({
      format: 'gcm',
      version: 'v1',
      nonce: 'AAECAwQFBgcICQoL',
      ciphertext: '-7JdJmiY-5ChVTuBmG2qZTIFzeg',
      authTag: 'XHFlpxhEtRnhYaHdJ0ySsg',
    });
    expect(service.decrypt(envelope, 'rwanda-nid')).toBe(
      'synthetic-identifier',
    );
    expect(
      service.open(
        service.seal('synthetic-identifier', 'rwanda-nid'),
        'rwanda-nid',
      ),
    ).toBe('synthetic-identifier');
  });

  it('rejects tampered ciphertext and purpose confusion', () => {
    const envelope = service.encrypt('synthetic-identifier', 'rwanda-nid');
    const tampered: IdentityEncryptionEnvelope = {
      ...envelope,
      ciphertext: `${envelope.ciphertext.slice(0, -1)}A`,
    };

    expect(() => service.decrypt(tampered, 'rwanda-nid')).toThrow();
    expect(() => service.decrypt(envelope, 'citizen-snapshot')).toThrow();
  });
});
