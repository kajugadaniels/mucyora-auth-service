import { ConflictException } from '@nestjs/common';
import { IdempotencyStatus } from '@mucyora/db';
import { DatabaseService } from '../database/database.service';
import { IdempotencyService } from './idempotency.service';

describe('IdempotencyService', () => {
  const expiry = new Date(Date.now() + 60_000);
  const digest = 'A'.repeat(43);

  it('claims a new bounded record', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({
      id: 'claim-1',
      requestDigest: digest,
      responseReference: null,
      status: IdempotencyStatus.IN_PROGRESS,
    });
    const database = {
      idempotencyRecord: { findUnique, create },
    } as unknown as DatabaseService;

    await expect(
      new IdempotencyService(database).claim(
        'registration',
        'request-key-1',
        digest,
        expiry,
      ),
    ).resolves.toMatchObject({
      id: 'claim-1',
      state: 'claimed',
    });
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('rejects a key reused with another request digest', async () => {
    const database = {
      idempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'claim-1',
          requestDigest: 'B'.repeat(43),
          responseReference: null,
          status: IdempotencyStatus.IN_PROGRESS,
        }),
      },
    } as unknown as DatabaseService;

    await expect(
      new IdempotencyService(database).claim(
        'registration',
        'request-key-1',
        digest,
        expiry,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
