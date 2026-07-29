import { ConflictException, Injectable } from '@nestjs/common';
import { IdempotencyStatus, Prisma } from '@mucyora/db';
import { DatabaseService } from '../database/database.service';

export interface IdempotencyClaim {
  id: string;
  state: 'claimed' | 'replay';
  status: IdempotencyStatus;
  responseReference: string | null;
}

@Injectable()
export class IdempotencyService {
  constructor(private readonly database: DatabaseService) {}

  async claim(
    scope: string,
    key: string,
    requestDigest: string,
    expiresAt: Date,
  ): Promise<IdempotencyClaim> {
    validateClaim(scope, key, requestDigest, expiresAt);
    const unique = { scope_key: { scope, key } };
    const select = {
      id: true,
      requestDigest: true,
      responseReference: true,
      status: true,
    } as const;

    const existing = await this.database.idempotencyRecord.findUnique({
      where: unique,
      select,
    });
    if (existing) {
      return this.resolveExisting(existing, requestDigest);
    }

    try {
      const created = await this.database.idempotencyRecord.create({
        data: { scope, key, requestDigest, expiresAt },
        select,
      });
      return {
        id: created.id,
        state: 'claimed',
        status: created.status,
        responseReference: created.responseReference,
      };
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }

      const raced = await this.database.idempotencyRecord.findUniqueOrThrow({
        where: unique,
        select,
      });
      return this.resolveExisting(raced, requestDigest);
    }
  }

  async complete(
    id: string,
    requestDigest: string,
    responseReference: string,
  ): Promise<boolean> {
    const result = await this.database.idempotencyRecord.updateMany({
      where: {
        id,
        requestDigest,
        status: IdempotencyStatus.IN_PROGRESS,
      },
      data: {
        status: IdempotencyStatus.COMPLETED,
        responseReference,
      },
    });

    return result.count === 1;
  }

  private resolveExisting(
    existing: {
      id: string;
      requestDigest: string;
      responseReference: string | null;
      status: IdempotencyStatus;
    },
    requestDigest: string,
  ): IdempotencyClaim {
    if (existing.requestDigest !== requestDigest) {
      throw new ConflictException(
        'The idempotency key was already used for a different request.',
      );
    }

    return {
      id: existing.id,
      state: 'replay',
      status: existing.status,
      responseReference: existing.responseReference,
    };
  }
}

function validateClaim(
  scope: string,
  key: string,
  requestDigest: string,
  expiresAt: Date,
): void {
  if (!/^[a-z0-9._:-]{1,80}$/.test(scope)) {
    throw new RangeError('Invalid idempotency scope.');
  }
  if (key.length < 8 || key.length > 200) {
    throw new RangeError('Invalid idempotency key length.');
  }
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(requestDigest)) {
    throw new RangeError('Invalid idempotency request digest.');
  }
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    throw new RangeError('Idempotency expiry must be in the future.');
  }
}
