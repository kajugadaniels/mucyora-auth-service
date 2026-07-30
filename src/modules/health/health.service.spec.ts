import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../common/database/database.service';
import { HealthService } from './health.service';
import type Redis from 'ioredis';

describe('HealthService', () => {
  const config = new ConfigService({ READINESS_CACHE_TTL_MS: 5_000 });
  const redis = {
    status: 'ready',
    ping: jest.fn().mockResolvedValue('PONG'),
  } as unknown as Redis;

  it('keeps liveness independent from the database', () => {
    const isReady = jest.fn();
    const database = { isReady } as unknown as DatabaseService;
    const service = new HealthService(database, config, redis);

    expect(service.live().status).toBe('ok');
    expect(isReady).not.toHaveBeenCalled();
  });

  it('reports database readiness and caches the check', async () => {
    const isReady = jest.fn().mockResolvedValue(true);
    const database = { isReady } as unknown as DatabaseService;
    const service = new HealthService(database, config, redis);

    await expect(service.ready()).resolves.toMatchObject({
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
    });
    await service.ready();

    expect(isReady).toHaveBeenCalledTimes(1);
  });

  it('reports dependency failures without leaking the cause', async () => {
    const database = {
      isReady: jest.fn().mockRejectedValue(new Error('connection secret')),
    } as unknown as DatabaseService;
    const service = new HealthService(database, config, redis);

    await expect(service.ready()).resolves.toMatchObject({
      status: 'unavailable',
      checks: { database: 'down' },
    });
  });
});
