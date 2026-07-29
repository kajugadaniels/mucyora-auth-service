import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';

import { AuthEnvironment } from '../../config/environment.validation';
import {
  CitizenLookupRateLimitError,
  CitizenLookupRateLimiter,
} from './citizen-lookup-rate-limiter.service';

describe('CitizenLookupRateLimiter', () => {
  it('increments distributed IP, client, and NID-digest dimensions', async () => {
    const evalScript = jest.fn().mockResolvedValue(1);
    const redis = {
      status: 'ready',
      eval: evalScript,
    } as unknown as Redis;
    const limiter = new CitizenLookupRateLimiter(redis, configService());

    await limiter.assertAllowed({
      ipDigest: 'ip-safe',
      clientDigest: 'client-safe',
      identityDigest: 'v1:nid-safe',
    });

    expect(evalScript).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(evalScript.mock.calls)).not.toContain(
      '1000000000000001',
    );
    const calls = evalScript.mock.calls as unknown[][];
    expect(calls.map((call) => call[2])).toEqual([
      'mucyora:auth:rate:citizen-lookup:ip:ip-safe',
      'mucyora:auth:rate:citizen-lookup:client:client-safe',
      'mucyora:auth:rate:citizen-lookup:nid:v1:nid-safe',
    ]);
  });

  it('denies when any distributed dimension exceeds its limit', async () => {
    const redis = {
      status: 'ready',
      eval: jest
        .fn()
        .mockResolvedValueOnce(6)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1),
    } as unknown as Redis;
    const limiter = new CitizenLookupRateLimiter(redis, configService());

    await expect(
      limiter.assertAllowed({
        ipDigest: 'ip-safe',
        clientDigest: 'client-safe',
        identityDigest: 'v1:nid-safe',
      }),
    ).rejects.toThrow(CitizenLookupRateLimitError);
  });
});

function configService(): ConfigService<AuthEnvironment, true> {
  const values: Partial<AuthEnvironment> = {
    CACHE_PREFIX: 'mucyora:auth:',
    CITIZEN_LOOKUP_IP_LIMIT_PER_MINUTE: 5,
    CITIZEN_LOOKUP_CLIENT_LIMIT_PER_MINUTE: 5,
    CITIZEN_LOOKUP_NID_LIMIT_PER_MINUTE: 3,
  };
  return {
    get: jest.fn((key: keyof AuthEnvironment) => values[key]),
  } as unknown as ConfigService<AuthEnvironment, true>;
}
