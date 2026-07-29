import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { ensureRedisConnected } from '../redis/redis-connection';
import { REDIS_CLIENT } from '../redis/redis.module';

export const CITIZEN_CACHE = Symbol('CITIZEN_CACHE');

export interface CitizenCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

@Injectable()
export class RedisCitizenCache implements CitizenCache, OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async get(key: string): Promise<string | null> {
    await this.connectIfNeeded();
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.connectIfNeeded();
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }

  async delete(key: string): Promise<void> {
    await this.connectIfNeeded();
    await this.redis.del(key);
  }

  onApplicationShutdown(): Promise<void> {
    if (this.redis.status !== 'end') {
      this.redis.disconnect(false);
    }
    return Promise.resolve();
  }

  private async connectIfNeeded(): Promise<void> {
    await ensureRedisConnected(this.redis);
  }
}
