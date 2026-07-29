import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';

import { AuthEnvironment } from '../../config/environment.validation';
import { ensureRedisConnected } from '../../integrations/redis/redis-connection';
import { REDIS_CLIENT } from '../../integrations/redis/redis.module';

const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

@Injectable()
export class DistributedJobLockService {
  constructor(
    private readonly config: ConfigService<AuthEnvironment, true>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async runExclusive<T>(
    jobName: string,
    ttlSeconds: number,
    work: () => Promise<T>,
  ): Promise<T | undefined> {
    await ensureRedisConnected(this.redis);
    const key = `${this.config.get('CACHE_PREFIX', {
      infer: true,
    })}lock:job:${jobName}`;
    const owner = randomUUID();
    const acquired = await this.redis.set(key, owner, 'EX', ttlSeconds, 'NX');
    if (acquired !== 'OK') {
      return undefined;
    }
    try {
      return await work();
    } finally {
      await this.redis.eval(RELEASE_LOCK_SCRIPT, 1, key, owner);
    }
  }
}
