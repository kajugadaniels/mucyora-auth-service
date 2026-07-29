import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';

import { AuthEnvironment } from '../../config/environment.validation';
import { ensureRedisConnected } from '../../integrations/redis/redis-connection';
import { REDIS_CLIENT } from '../../integrations/redis/redis.module';

const WINDOW_MILLISECONDS = 60_000;
const INCREMENT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return current
`;

export class AuthenticationRateLimitError extends Error {
  constructor() {
    super('Authentication rate limit exceeded');
    this.name = 'AuthenticationRateLimitError';
  }
}

@Injectable()
export class AuthRateLimiter {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<AuthEnvironment, true>,
  ) {}

  async assertLoginAllowed(input: {
    ipDigest: string;
    emailDigest: string;
    deviceDigest: string;
  }): Promise<void> {
    await this.assertAllowed(
      'login',
      this.config.get('LOGIN_LIMIT_PER_MINUTE', { infer: true }),
      [
        ['ip', input.ipDigest],
        ['email', input.emailDigest],
        ['device', input.deviceDigest],
      ],
    );
  }

  async assertRefreshAllowed(tokenDigest: string): Promise<void> {
    await this.assertAllowed(
      'refresh',
      this.config.get('REFRESH_LIMIT_PER_MINUTE', { infer: true }),
      [['token', tokenDigest]],
    );
  }

  private async assertAllowed(
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
          WINDOW_MILLISECONDS,
        ),
      ),
    );
    if (counts.some((count) => Number(count) > limit)) {
      throw new AuthenticationRateLimitError();
    }
  }
}
