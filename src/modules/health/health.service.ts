import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../common/database/database.service';

export interface HealthStatus {
  status: 'ok' | 'unavailable';
  service: 'mucyora-auth';
  timestamp: string;
  checks?: {
    database: 'up' | 'down';
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
      await this.database.isReady();
      return {
        status: 'ok',
        service: 'mucyora-auth',
        timestamp: new Date().toISOString(),
        checks: { database: 'up' },
      };
    } catch {
      return {
        status: 'unavailable',
        service: 'mucyora-auth',
        timestamp: new Date().toISOString(),
        checks: { database: 'down' },
      };
    }
  }
}
