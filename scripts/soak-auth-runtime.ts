import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { ConfigService } from '@nestjs/config';

import {
  defaultIdentityNonceFactory,
  IdentityEncryptionService,
} from '../src/common/security/identity-encryption.service';
import { KeyedDigestService } from '../src/common/security/keyed-digest.service';

const durationSeconds = Number(process.env.LOCAL_SOAK_SECONDS ?? 30);
if (
  !Number.isInteger(durationSeconds) ||
  durationSeconds < 5 ||
  durationSeconds > 600
) {
  throw new Error('LOCAL_SOAK_SECONDS must be an integer between 5 and 600.');
}

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

async function main(): Promise<void> {
  const lag = monitorEventLoopDelay({ resolution: 10 });
  const startedAt = performance.now();
  const initialHeap = process.memoryUsage().heapUsed;
  let operations = 0;
  lag.enable();

  while (performance.now() - startedAt < durationSeconds * 1_000) {
    for (let index = 0; index < 20; index += 1) {
      const value = `synthetic-${operations + index}`;
      digests.token(value);
      const sealed = encryption.encrypt(value, 'registration-challenge-token');
      encryption.decrypt(sealed, 'registration-challenge-token');
    }
    operations += 20;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  lag.disable();
  const finalMemory = process.memoryUsage();
  process.stdout.write(
    `${JSON.stringify({
      benchmark: 'local_crypto_soak',
      durationSeconds,
      operations,
      operationsPerSecond: Math.round(operations / durationSeconds),
      eventLoopDelayP99Ms: Number((lag.percentile(99) / 1_000_000).toFixed(3)),
      heapGrowthMiB: Number(
        ((finalMemory.heapUsed - initialHeap) / 1_048_576).toFixed(2),
      ),
      rssMiB: Number((finalMemory.rss / 1_048_576).toFixed(2)),
      syntheticOnly: true,
    })}\n`,
  );
}

void main();
