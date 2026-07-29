/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ExecutionContext } from '@nestjs/common';
import { SessionLevel, SessionStatus, UserAccountStatus } from '@mucyora/db';

import { DatabaseService } from '../../common/database/database.service';
import { AccessAuthGuard } from './access-auth.guard';
import { AccessTokenService } from './access-token.service';

describe('AccessAuthGuard', () => {
  const claims = {
    iss: 'mucyora-auth',
    aud: ['mucyora-user'],
    sub: 'user-1',
    sid: 'session-1',
    jti: 'token-1',
    sessionLevel: SessionLevel.FULL,
    identityVerified: true,
    emailVerified: true,
    tokenType: 'access' as const,
    iat: 1,
    exp: 2,
  };

  it('rejects a signed access token after its session is revoked', async () => {
    const request = {
      header: jest.fn().mockReturnValue('Bearer signed.token.value'),
    };
    const guard = new AccessAuthGuard(
      {
        verify: jest.fn().mockReturnValue(claims),
      } as unknown as AccessTokenService,
      {
        authSession: {
          findUnique: jest.fn().mockResolvedValue({
            userId: 'user-1',
            status: SessionStatus.REVOKED,
            expiresAt: new Date(Date.now() + 60_000),
            sessionLevel: SessionLevel.FULL,
            user: { accountStatus: UserAccountStatus.ACTIVE },
          }),
        },
      } as unknown as DatabaseService,
    );

    await expect(
      guard.canActivate(executionContext(request)),
    ).rejects.toMatchObject({
      status: 401,
      response: expect.objectContaining({ code: 'ACCESS_TOKEN_INVALID' }),
    });
    expect(request).not.toHaveProperty('auth');
  });
});

function executionContext(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}
