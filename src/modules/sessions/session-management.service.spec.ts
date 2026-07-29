/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { SessionLevel, SessionStatus } from '@mucyora/db';

import { DatabaseService } from '../../common/database/database.service';
import { KeyedDigestService } from '../../common/security/keyed-digest.service';
import type { AccessTokenClaims } from '../auth/access-token.service';
import { SessionManagementService } from './session-management.service';

const principal = {
  sub: 'user-1',
  sid: 'session-1',
  jti: 'token-1',
  sessionLevel: SessionLevel.FULL,
} as AccessTokenClaims;

describe('SessionManagementService', () => {
  it('lists only bounded active owned sessions and marks the current one', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'session-1',
        sessionLevel: SessionLevel.FULL,
        deviceId: 'device-1',
        deviceLabel: 'Phone',
        createdAt: new Date(),
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);
    const service = createService({
      authSession: { findMany },
    } as unknown as DatabaseService);

    await expect(service.list(principal)).resolves.toMatchObject([
      { id: 'session-1', current: true },
    ]);
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { userId: 'user-1', status: SessionStatus.ACTIVE },
      take: 100,
    });
  });

  it('revokes sessions and every associated refresh digest atomically', async () => {
    const transaction = {
      authSession: {
        findMany: jest.fn().mockResolvedValue([{ id: 'session-1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      refreshToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      authSecurityEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-1' }),
      },
    };
    const service = createService({
      $transaction: jest.fn((callback) =>
        Promise.resolve(callback(transaction)),
      ),
    } as unknown as DatabaseService);

    await service.logout(principal, {
      correlationId: 'correlation-1',
      ipAddress: '127.0.0.1',
    });

    expect(transaction.authSession.updateMany.mock.calls[0][0]).toMatchObject({
      data: { status: SessionStatus.REVOKED },
    });
    expect(transaction.refreshToken.updateMany.mock.calls[0][0]).toMatchObject({
      where: { sessionId: { in: ['session-1'] } },
    });
  });
});

function createService(database: DatabaseService): SessionManagementService {
  return new SessionManagementService(database, {
    requestContext: jest.fn().mockReturnValue('safe-ip-digest'),
  } as unknown as KeyedDigestService);
}
