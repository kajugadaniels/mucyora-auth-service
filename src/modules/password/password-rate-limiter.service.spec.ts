import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';

import { AuthEnvironment } from '../../config/environment.validation';
import {
  PasswordRateLimitError,
  PasswordRateLimiter,
} from './password-rate-limiter.service';

describe('PasswordRateLimiter', () => {
  it('increments distributed keyed dimensions without plaintext identifiers', async () => {
    const evaluate = jest.fn().mockResolvedValue(1);
    const limiter = new PasswordRateLimiter(
      { status: 'ready', eval: evaluate } as unknown as Redis,
      configService(),
    );

    await limiter.assertResetRequestAllowed('safe-ip', 'safe-email');

    expect(evaluate).toHaveBeenCalledTimes(2);
    const calls = evaluate.mock.calls as unknown[][];
    expect(calls.map((call) => call[2])).toEqual([
      'mucyora:auth:limit:password:forgot:safe-ip',
      'mucyora:auth:limit:password:forgot:safe-email',
    ]);
    expect(JSON.stringify(evaluate.mock.calls)).not.toContain(
      'user@example.com',
    );
  });

  it('denies when any distributed dimension exceeds its limit', async () => {
    const limiter = new PasswordRateLimiter(
      {
        status: 'ready',
        eval: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(4),
      } as unknown as Redis,
      configService(),
    );

    await expect(
      limiter.assertResetRequestAllowed('safe-ip', 'safe-email'),
    ).rejects.toThrow(PasswordRateLimitError);
  });
});

function configService(): ConfigService<AuthEnvironment, true> {
  const values: Partial<AuthEnvironment> = {
    CACHE_PREFIX: 'mucyora:auth:',
    PASSWORD_RESET_LIMIT_PER_HOUR: 3,
    PASSWORD_CHANGE_LIMIT_PER_HOUR: 5,
  };
  return {
    get: jest.fn((key: keyof AuthEnvironment) => values[key]),
  } as unknown as ConfigService<AuthEnvironment, true>;
}
