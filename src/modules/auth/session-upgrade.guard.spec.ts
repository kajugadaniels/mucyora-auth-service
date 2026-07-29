import { ExecutionContext } from '@nestjs/common';
import { SessionLevel, SessionStatus, UserAccountStatus } from '@mucyora/db';

import { DatabaseService } from '../../common/database/database.service';
import { AccessTokenService } from './access-token.service';
import {
  SESSION_UPGRADE_REVOCATION_REASON,
  SessionUpgradeGuard,
} from './session-upgrade.guard';

describe('SessionUpgradeGuard', () => {
  it.each([
    [SessionStatus.ACTIVE, null],
    [SessionStatus.REVOKED, SESSION_UPGRADE_REVOCATION_REASON],
  ])(
    'allows an active upgrade or its exact replay state',
    async (status, reason) => {
      const request = { header: jest.fn().mockReturnValue('Bearer token') };
      const guard = guardFor({ status, revocationReason: reason });

      await expect(guard.canActivate(context(request))).resolves.toBe(true);
      expect(request).toHaveProperty('auth.sub', 'user-1');
    },
  );

  it('rejects a limited session revoked for another reason', async () => {
    const guard = guardFor({
      status: SessionStatus.REVOKED,
      revocationReason: 'LOGOUT',
    });

    await expect(
      guard.canActivate(
        context({ header: jest.fn().mockReturnValue('Bearer token') }),
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
});

function guardFor(session: {
  status: SessionStatus;
  revocationReason: string | null;
}): SessionUpgradeGuard {
  return new SessionUpgradeGuard(
    {
      verify: jest.fn().mockReturnValue({
        sub: 'user-1',
        sid: 'limited-1',
        sessionLevel: SessionLevel.LIMITED,
      }),
    } as unknown as AccessTokenService,
    {
      authSession: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'user-1',
          sessionLevel: SessionLevel.LIMITED,
          expiresAt: new Date(Date.now() + 60_000),
          user: { accountStatus: UserAccountStatus.ACTIVE },
          ...session,
        }),
      },
    } as unknown as DatabaseService,
  );
}

function context(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
