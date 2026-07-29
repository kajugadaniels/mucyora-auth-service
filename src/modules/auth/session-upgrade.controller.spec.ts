/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { ConfigService } from '@nestjs/config';
import { SessionLevel } from '@mucyora/db';
import { Response } from 'express';

import { AuthEnvironment } from '../../config/environment.validation';
import { TokenTransport } from './dto/auth.dto';
import { SessionUpgradeController } from './session-upgrade.controller';
import { SessionUpgradeService } from './session-upgrade.service';

describe('SessionUpgradeController', () => {
  it('requires a bounded idempotency key', async () => {
    const { controller, upgrades } = fixture();

    await expect(
      controller.upgrade(
        {
          verificationAttemptId: 'e31a3bb5-04b9-49b7-961d-47405972ac95',
          transport: TokenTransport.NATIVE,
        },
        undefined,
        request(),
        { cookie: jest.fn() } as unknown as Response,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(upgrades.upgrade).not.toHaveBeenCalled();
  });

  it('sets refresh and CSRF cookies only for cookie transport', async () => {
    const { controller } = fixture(TokenTransport.COOKIE);
    const cookie = jest.fn();

    const response = await controller.upgrade(
      {
        verificationAttemptId: 'e31a3bb5-04b9-49b7-961d-47405972ac95',
        transport: TokenTransport.COOKIE,
      },
      'upgrade-request-0001',
      request(),
      { cookie } as unknown as Response,
    );

    expect(response.sessionLevel).toBe(SessionLevel.FULL);
    expect(response.refreshToken).toBeUndefined();
    expect(cookie).toHaveBeenCalledTimes(2);
    expect(cookie.mock.calls[0][2]).toMatchObject({ httpOnly: true });
    expect(cookie.mock.calls[1][2]).toMatchObject({ httpOnly: false });
  });
});

function fixture(transport = TokenTransport.NATIVE) {
  const upgrades = {
    upgrade: jest.fn().mockResolvedValue({
      response: {
        accessToken: 'access',
        expiresIn: 900,
        sessionLevel: SessionLevel.FULL,
        identityVerified: true,
        ...(transport === TokenTransport.NATIVE
          ? { refreshToken: 'refresh' }
          : {}),
      },
      refreshToken: 'refresh',
      csrfToken: 'csrf',
      transport,
    }),
  };
  const values: Partial<AuthEnvironment> = {
    COOKIE_SECURE: true,
    COOKIE_SAME_SITE: 'lax',
    COOKIE_DOMAIN: '',
    REFRESH_COOKIE_NAME: 'mucyora_refresh',
    CSRF_COOKIE_NAME: 'mucyora_csrf',
    REFRESH_TOKEN_TTL_SECONDS: 2_592_000,
  };
  return {
    upgrades,
    controller: new SessionUpgradeController(
      upgrades as unknown as SessionUpgradeService,
      {
        get: jest.fn((key: keyof AuthEnvironment) => values[key]),
      } as unknown as ConfigService<AuthEnvironment, true>,
    ),
  };
}

function request() {
  return {
    auth: { sub: 'user-1', sid: 'limited-1' },
    correlationId: 'correlation-1',
    ip: '127.0.0.1',
    socket: {},
    header: jest.fn().mockReturnValue('test-agent'),
  } as Parameters<SessionUpgradeController['upgrade']>[2];
}
