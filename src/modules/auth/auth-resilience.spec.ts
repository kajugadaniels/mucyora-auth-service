import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';

import { AuthEnvironment } from '../../config/environment.validation';
import { AuthRateLimiter } from './auth-rate-limiter.service';

describe('authentication resilience', () => {
  it('fails closed without retrying when distributed rate-limit state is unavailable', async () => {
    const evalCommand = jest
      .fn()
      .mockRejectedValue(new Error('synthetic redis outage'));
    const limiter = new AuthRateLimiter(
      {
        status: 'ready',
        eval: evalCommand,
      } as unknown as Redis,
      config(),
    );

    await expect(
      limiter.assertLoginAllowed({
        ipDigest: 'ip',
        emailDigest: 'email',
        deviceDigest: 'device',
      }),
    ).rejects.toThrow('synthetic redis outage');
    expect(evalCommand).toHaveBeenCalledTimes(3);
  });

  it('keeps rate limiting active at the configured boundary', async () => {
    const limiter = new AuthRateLimiter(
      {
        status: 'ready',
        eval: jest.fn().mockResolvedValue(6),
      } as unknown as Redis,
      config(),
    );

    await expect(
      limiter.assertLoginAllowed({
        ipDigest: 'ip',
        emailDigest: 'email',
        deviceDigest: 'device',
      }),
    ).rejects.toThrow('rate limit exceeded');
  });
});

function config(): ConfigService<AuthEnvironment, true> {
  const values: Partial<AuthEnvironment> = {
    CACHE_PREFIX: 'mucyora:auth:',
    LOGIN_LIMIT_PER_MINUTE: 5,
  };
  return {
    get: jest.fn((key: keyof AuthEnvironment) => values[key]),
  } as unknown as ConfigService<AuthEnvironment, true>;
}
