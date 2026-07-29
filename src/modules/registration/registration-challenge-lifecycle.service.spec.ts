import { ConfigService } from '@nestjs/config';
import { Prisma } from '@mucyora/db';

import { AuthEnvironment } from '../../config/environment.validation';
import { RegistrationChallengeLifecycleService } from './registration-challenge-lifecycle.service';

describe('RegistrationChallengeLifecycleService', () => {
  const config = {
    get: jest.fn().mockReturnValue(3),
  } as unknown as ConfigService<AuthEnvironment, true>;

  it('records attempts only while the challenge is eligible', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      registrationChallenge: { updateMany },
    } as unknown as Prisma.TransactionClient;
    const service = new RegistrationChallengeLifecycleService(config);
    const now = new Date('2026-07-29T20:00:00.000Z');

    await expect(
      service.recordAttempt(transaction, 'challenge-1', now),
    ).resolves.toBe(true);
    const calls = updateMany.mock.calls as unknown[][];
    expect(calls[0][0]).toMatchObject({
      where: {
        id: 'challenge-1',
        consumedAt: null,
        expiresAt: { gt: now },
        attemptCount: { lt: 3 },
      },
      data: { attemptCount: { increment: 1 } },
    });
  });

  it('allows only one atomic challenge consumption', async () => {
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const transaction = {
      registrationChallenge: { updateMany },
    } as unknown as Prisma.TransactionClient;
    const service = new RegistrationChallengeLifecycleService(config);
    const now = new Date('2026-07-29T20:00:00.000Z');

    await expect(
      service.consume(transaction, 'challenge-1', now),
    ).resolves.toBe(true);
    await expect(
      service.consume(transaction, 'challenge-1', now),
    ).resolves.toBe(false);
  });
});
