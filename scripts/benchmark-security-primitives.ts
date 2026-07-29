import { performance } from 'node:perf_hooks';
import { ConfigService } from '@nestjs/config';
import {
  defaultIdentityNonceFactory,
  IdentityEncryptionService,
} from '../src/common/security/identity-encryption.service';
import { KeyedDigestService } from '../src/common/security/keyed-digest.service';

const config = new ConfigService({
  IDENTITY_ENCRYPTION_KEY_VERSION: 'v1',
  IDENTITY_ENCRYPTION_SECRET: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  IDENTITY_LOOKUP_KEY_VERSION: 'v1',
  IDENTITY_LOOKUP_HMAC_KEY: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE',
  TOKEN_DIGEST_HMAC_KEY: 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI',
  REQUEST_CONTEXT_HMAC_KEY: 'AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM',
});
const digests = new KeyedDigestService(config);
const encryption = new IdentityEncryptionService(
  config,
  defaultIdentityNonceFactory,
);

benchmark('HMAC identity lookup', 20_000, () => {
  digests.identityLookup('synthetic-identifier');
});

benchmark('AES-256-GCM encrypt/decrypt', 5_000, () => {
  const envelope = encryption.encrypt('synthetic-identifier', 'rwanda-nid');
  encryption.decrypt(envelope, 'rwanda-nid');
});

function benchmark(
  label: string,
  iterations: number,
  operation: () => void,
): void {
  for (let index = 0; index < 100; index += 1) {
    operation();
  }

  const startedAt = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    operation();
  }
  const elapsedMs = performance.now() - startedAt;

  console.log(
    JSON.stringify({
      benchmark: label,
      iterations,
      elapsedMs: Number(elapsedMs.toFixed(2)),
      operationsPerSecond: Math.round(iterations / (elapsedMs / 1_000)),
    }),
  );
}
