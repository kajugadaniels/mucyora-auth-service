import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, RegistrationChallengeStatus } from '@mucyora/db';

import { AuthEnvironment } from '../../config/environment.validation';

@Injectable()
export class RegistrationChallengeLifecycleService {
  constructor(private readonly config: ConfigService<AuthEnvironment, true>) {}

  async recordAttempt(
    transaction: Prisma.TransactionClient,
    challengeId: string,
    now: Date,
  ): Promise<boolean> {
    const result = await transaction.registrationChallenge.updateMany({
      where: {
        id: challengeId,
        status: RegistrationChallengeStatus.PENDING,
        consumedAt: null,
        expiresAt: { gt: now },
        attemptCount: {
          lt: this.config.get('REGISTRATION_CHALLENGE_MAX_ATTEMPTS', {
            infer: true,
          }),
        },
      },
      data: {
        attemptCount: { increment: 1 },
      },
    });

    return result.count === 1;
  }

  async consume(
    transaction: Prisma.TransactionClient,
    challengeId: string,
    now: Date,
  ): Promise<boolean> {
    const result = await transaction.registrationChallenge.updateMany({
      where: {
        id: challengeId,
        status: RegistrationChallengeStatus.PENDING,
        consumedAt: null,
        expiresAt: { gt: now },
        attemptCount: {
          lte: this.config.get('REGISTRATION_CHALLENGE_MAX_ATTEMPTS', {
            infer: true,
          }),
        },
      },
      data: {
        status: RegistrationChallengeStatus.CONSUMED,
        consumedAt: now,
      },
    });

    return result.count === 1;
  }
}
