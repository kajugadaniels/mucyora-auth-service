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

export class CitizenLookupRateLimitError extends Error {
  constructor() {
    super('Citizen lookup rate limit exceeded');
    this.name = 'CitizenLookupRateLimitError';
  }
}

@Injectable()
export class CitizenLookupRateLimiter {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<AuthEnvironment, true>,
  ) {}

  async assertAllowed(input: {
    ipDigest: string;
    clientDigest: string;
    identityDigest: string;
  }): Promise<void> {
    await ensureRedisConnected(this.redis);

    const prefix = this.config.get('CACHE_PREFIX', { infer: true });
    const dimensions = [
      {
        key: `${prefix}rate:citizen-lookup:ip:${input.ipDigest}`,
        limit: this.config.get('CITIZEN_LOOKUP_IP_LIMIT_PER_MINUTE', {
          infer: true,
        }),
      },
      {
        key: `${prefix}rate:citizen-lookup:client:${input.clientDigest}`,
        limit: this.config.get('CITIZEN_LOOKUP_CLIENT_LIMIT_PER_MINUTE', {
          infer: true,
        }),
      },
      {
        key: `${prefix}rate:citizen-lookup:nid:${input.identityDigest}`,
        limit: this.config.get('CITIZEN_LOOKUP_NID_LIMIT_PER_MINUTE', {
          infer: true,
        }),
      },
    ];

    const counts = await Promise.all(
      dimensions.map(({ key }) =>
        this.redis.eval(INCREMENT_SCRIPT, 1, key, WINDOW_MILLISECONDS),
      ),
    );

    if (
      counts.some((count, index) => Number(count) > dimensions[index].limit)
    ) {
      throw new CitizenLookupRateLimitError();
    }
  }
}
