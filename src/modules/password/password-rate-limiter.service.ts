import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';

import { AuthEnvironment } from '../../config/environment.validation';
import { ensureRedisConnected } from '../../integrations/redis/redis-connection';
import { REDIS_CLIENT } from '../../integrations/redis/redis.module';

const WINDOW_MILLISECONDS = 3_600_000;
const INCREMENT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return current
`;

export class PasswordRateLimitError extends Error {}

@Injectable()
export class PasswordRateLimiter {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<AuthEnvironment, true>,
  ) {}

  async assertResetRequestAllowed(
    ipHash: string,
    emailHash: string,
  ): Promise<void> {
    const limit = this.config.get('PASSWORD_RESET_LIMIT_PER_HOUR', {
      infer: true,
    });
    await this.assertDimensions('forgot', limit, [ipHash, emailHash]);
  }

  async assertResetAllowed(ipHash: string, tokenDigest: string): Promise<void> {
    const limit = this.config.get('PASSWORD_RESET_LIMIT_PER_HOUR', {
      infer: true,
    });
    await this.assertDimensions('reset', limit, [ipHash, tokenDigest]);
  }

  async assertChangeAllowed(ipHash: string, userId: string): Promise<void> {
    const limit = this.config.get('PASSWORD_CHANGE_LIMIT_PER_HOUR', {
      infer: true,
    });
    await this.assertDimensions('change', limit, [ipHash, userId]);
  }

  private async assertDimensions(
    operation: string,
    limit: number,
    dimensions: string[],
  ): Promise<void> {
    await ensureRedisConnected(this.redis);
    const prefix = this.config.get('CACHE_PREFIX', { infer: true });
    const counts = await Promise.all(
      dimensions.map((dimension) =>
        this.redis.eval(
          INCREMENT_SCRIPT,
          1,
          `${prefix}limit:password:${operation}:${dimension}`,
          WINDOW_MILLISECONDS,
        ),
      ),
    );
    if (counts.some((count) => Number(count) > limit)) {
      throw new PasswordRateLimitError();
    }
  }
}
