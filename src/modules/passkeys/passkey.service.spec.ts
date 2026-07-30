/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unnecessary-type-assertion */
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';

import { DatabaseService } from '../../common/database/database.service';
import { TokenService } from '../../common/security/token.service';
import { KeyedDigestService } from '../../common/security/keyed-digest.service';
import { AuthEnvironment } from '../../config/environment.validation';
import { PasskeyService } from './passkey.service';

describe('PasskeyService', () => {
  it('consumes one digest-only recovery code and creates a reset request', async () => {
    const transaction = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }),
      },
      accountRecoveryCode: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      passwordResetRequest: {
        create: jest.fn().mockResolvedValue({ id: 'reset-1' }),
      },
    };
    const database = {
      $transaction: jest.fn((callback) =>
        Promise.resolve(callback(transaction)),
      ),
    } as unknown as DatabaseService;
    const tokens = {
      digest: jest.fn().mockReturnValue('recovery-code-digest'),
      generate: jest.fn().mockReturnValue({
        token: 'raw-reset-token',
        digest: 'reset-token-digest',
      }),
    } as unknown as TokenService;
    const service = new PasskeyService(
      database,
      new ConfigService({}) as ConfigService<AuthEnvironment, true>,
      tokens,
      {} as never,
      {} as KeyedDigestService,
      {} as Redis,
    );

    await expect(
      service.consumeRecoveryCode({
        email: 'aline.uwase@example.rw',
        recoveryCode: 'RwandaRecoveryCode_0001',
      }),
    ).resolves.toMatchObject({ resetToken: 'raw-reset-token' });
    expect(transaction.accountRecoveryCode.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        codeDigest: 'recovery-code-digest',
        usedAt: null,
        revokedAt: null,
      },
      data: { usedAt: expect.any(Date) },
    });
    expect(
      JSON.stringify(transaction.passwordResetRequest.create.mock.calls),
    ).not.toContain('raw-reset-token');
  });
});
