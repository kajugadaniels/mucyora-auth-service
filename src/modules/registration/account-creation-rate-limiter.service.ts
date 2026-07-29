import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';

import { AuthEnvironment } from '../../config/environment.validation';
import { ensureRedisConnected } from '../../integrations/redis/redis-connection';
import { REDIS_CLIENT } from '../../integrations/redis/redis.module';

const HOUR_MILLISECONDS = 3_600_000;
const INCREMENT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return current
`;

export class AccountCreationRateLimitError extends Error {
  constructor() {
    super('Account workflow rate limit exceeded');
    this.name = 'AccountCreationRateLimitError';
  }
}

@Injectable()
export class AccountCreationRateLimiter {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<AuthEnvironment, true>,
  ) {}

  async assertRegistrationAllowed(
    ipDigest: string,
    identityDigest: string,
  ): Promise<void> {
    const limit = this.config.get('REGISTRATION_LIMIT_PER_HOUR', {
      infer: true,
    });
    await this.assertDimensions('registration', limit, [
      ['ip', ipDigest],
      ['identity', identityDigest],
    ]);
  }

  async assertResendAllowed(
    ipDigest: string,
    emailDigest: string,
  ): Promise<void> {
    const limit = this.config.get('EMAIL_RESEND_LIMIT_PER_HOUR', {
      infer: true,
    });
    await this.assertDimensions('email-resend', limit, [
      ['ip', ipDigest],
      ['email', emailDigest],
    ]);
  }

  private async assertDimensions(
    operation: string,
    limit: number,
    dimensions: Array<readonly [string, string]>,
  ): Promise<void> {
    await ensureRedisConnected(this.redis);
    const prefix = this.config.get('CACHE_PREFIX', { infer: true });
    const counts = await Promise.all(
      dimensions.map(([dimension, digest]) =>
        this.redis.eval(
          INCREMENT_SCRIPT,
          1,
          `${prefix}rate:${operation}:${dimension}:${digest}`,
          HOUR_MILLISECONDS,
        ),
      ),
    );

    if (counts.some((count) => Number(count) > limit)) {
      throw new AccountCreationRateLimitError();
    }
  }
}
