import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../common/database/database.service';
import type Redis from 'ioredis';
import { ensureRedisConnected } from '../../integrations/redis/redis-connection';
import { REDIS_CLIENT } from '../../integrations/redis/redis.module';

export interface HealthStatus {
  status: 'ok' | 'unavailable';
  service: 'mucyora-auth';
  timestamp: string;
  checks?: {
    database: 'up' | 'down';
    redis: 'up' | 'down' | 'disabled';
  };
}

@Injectable()
export class HealthService {
  private cachedReadiness:
    { expiresAt: number; value: HealthStatus } | undefined;
  private readinessPromise: Promise<HealthStatus> | undefined;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  live(): HealthStatus {
    return {
      status: 'ok',
      service: 'mucyora-auth',
      timestamp: new Date().toISOString(),
    };
  }

  async ready(): Promise<HealthStatus> {
    const now = Date.now();
    if (this.cachedReadiness && this.cachedReadiness.expiresAt > now) {
      return this.cachedReadiness.value;
    }

    if (this.readinessPromise) {
      return this.readinessPromise;
    }

    this.readinessPromise = this.checkReadiness();
    try {
      const value = await this.readinessPromise;
      this.cachedReadiness = {
        expiresAt:
          now + this.config.get<number>('READINESS_CACHE_TTL_MS', 5_000),
        value,
      };
      return value;
    } finally {
      this.readinessPromise = undefined;
    }
  }

  private async checkReadiness(): Promise<HealthStatus> {
    try {
      const [database, redis] = await Promise.allSettled([
        this.database.isReady(),
        this.config.get<boolean>('READINESS_REDIS_REQUIRED', true)
          ? this.checkRedis()
          : Promise.resolve('disabled'),
      ]);
      if (database.status === 'rejected' || redis.status === 'rejected') {
        return {
          status: 'unavailable',
          service: 'mucyora-auth',
          timestamp: new Date().toISOString(),
          checks: {
            database: database.status === 'fulfilled' ? 'up' : 'down',
            redis:
              redis.status === 'fulfilled'
                ? redis.value === 'disabled'
                  ? 'disabled'
                  : 'up'
                : 'down',
          },
        };
      }
      return {
        status: 'ok',
        service: 'mucyora-auth',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'up',
          redis: redis.value === 'disabled' ? 'disabled' : 'up',
        },
      };
    } catch {
      return {
        status: 'unavailable',
        service: 'mucyora-auth',
        timestamp: new Date().toISOString(),
        checks: { database: 'down', redis: 'down' },
      };
    }
  }

  private async checkRedis(): Promise<void> {
    await ensureRedisConnected(this.redis);
    await this.redis.ping();
  }
}
