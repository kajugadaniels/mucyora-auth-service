import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';

import { AuthEnvironment } from '../../config/environment.validation';
import { DistributedJobLockService } from './distributed-job-lock.service';

describe('DistributedJobLockService', () => {
  it('runs one leader and releases only its owned lock', async () => {
    const redis = {
      status: 'ready',
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockResolvedValue(1),
    };
    const service = createService(redis);
    const work = jest.fn().mockResolvedValue(7);

    await expect(service.runExclusive('cleanup', 60, work)).resolves.toBe(7);
    expect(work).toHaveBeenCalledTimes(1);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('GET'"),
      1,
      'mucyora:auth:lock:job:cleanup',
      expect.any(String),
    );
  });

  it('does not run when another replica owns the lease', async () => {
    const service = createService({
      status: 'ready',
      set: jest.fn().mockResolvedValue(null),
      eval: jest.fn(),
    });
    const work = jest.fn();

    await expect(service.runExclusive('cleanup', 60, work)).resolves.toBe(
      undefined,
    );
    expect(work).not.toHaveBeenCalled();
  });
});

function createService(redis: object): DistributedJobLockService {
  return new DistributedJobLockService(
    {
      get: jest.fn().mockReturnValue('mucyora:auth:'),
    } as unknown as ConfigService<AuthEnvironment, true>,
    redis as Redis,
  );
}
