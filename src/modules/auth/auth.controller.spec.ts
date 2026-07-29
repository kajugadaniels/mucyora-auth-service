/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { ConfigService } from '@nestjs/config';
import { SessionLevel } from '@mucyora/db';
import { Request, Response } from 'express';

import { KeyedDigestService } from '../../common/security/keyed-digest.service';
import { AuthEnvironment } from '../../config/environment.validation';
import { AuthController } from './auth.controller';
import { AuthenticationService } from './authentication.service';
import { TokenTransport } from './dto/auth.dto';

describe('AuthController cookie transport', () => {
  it('sets an HttpOnly refresh cookie and readable CSRF cookie', async () => {
    const cookie = jest.fn();
    const controller = createController({
      login: jest.fn().mockResolvedValue({
        response: {
          accessToken: 'access',
          expiresIn: 900,
          sessionLevel: SessionLevel.LIMITED,
          identityVerified: false,
        },
        refreshToken: 'refresh-secret',
        csrfToken: 'csrf-value',
        transport: TokenTransport.COOKIE,
      }),
    });

    await controller.login(
      {
        email: 'user@example.com',
        password: 'password',
        deviceId: 'device-instance-0001',
        transport: TokenTransport.COOKIE,
      },
      request({}),
      { cookie } as unknown as Response,
    );

    expect(cookie.mock.calls[0][2]).toMatchObject({
      httpOnly: true,
      secure: true,
      path: '/api/v1/auth',
    });
    expect(cookie.mock.calls[1][2]).toMatchObject({ httpOnly: false });
  });

  it('rejects cookie refresh without a matching CSRF header', async () => {
    const refresh = jest.fn();
    const controller = createController({ refresh });

    await expect(
      controller.refresh(
        { transport: TokenTransport.COOKIE },
        request({
          cookies: {
            mucyora_refresh: 'refresh-secret',
            mucyora_csrf: 'csrf-cookie',
          },
          csrfHeader: 'different-value',
        }),
        { cookie: jest.fn() } as unknown as Response,
      ),
    ).rejects.toThrow('invalid or unavailable');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('accepts cookie refresh only when CSRF evidence is bound to the refresh token', async () => {
    const refresh = jest.fn().mockResolvedValue({
      response: {
        accessToken: 'rotated-access',
        expiresIn: 900,
        sessionLevel: SessionLevel.LIMITED,
        identityVerified: false,
      },
      refreshToken: 'rotated-refresh',
      csrfToken: 'rotated-csrf',
      transport: TokenTransport.COOKIE,
    });
    const cookie = jest.fn();
    const controller = createController({ refresh });

    await controller.refresh(
      { transport: TokenTransport.COOKIE },
      request({
        cookies: {
          mucyora_refresh: 'refresh-secret',
          mucyora_csrf: 'csrf-cookie',
        },
        csrfHeader: 'csrf-cookie',
      }),
      { cookie } as unknown as Response,
    );

    expect(refresh).toHaveBeenCalledWith(
      'refresh-secret',
      TokenTransport.COOKIE,
      expect.any(Object),
    );
    expect(cookie).toHaveBeenCalledTimes(2);
  });
});

function createController(
  authentication: Partial<AuthenticationService>,
): AuthController {
  const values: Partial<AuthEnvironment> = {
    COOKIE_SECURE: true,
    COOKIE_SAME_SITE: 'lax',
    COOKIE_DOMAIN: '',
    REFRESH_COOKIE_NAME: 'mucyora_refresh',
    CSRF_COOKIE_NAME: 'mucyora_csrf',
    REFRESH_TOKEN_TTL_SECONDS: 2_592_000,
  };
  return new AuthController(
    authentication as AuthenticationService,
    {
      get: jest.fn((key: keyof AuthEnvironment) => values[key]),
    } as unknown as ConfigService<AuthEnvironment, true>,
    {
      requestContext: jest.fn().mockReturnValue('csrf-cookie'),
    } as unknown as KeyedDigestService,
  );
}

function request(input: {
  cookies?: Record<string, string>;
  csrfHeader?: string;
}): Request & { correlationId: string } {
  return {
    cookies: input.cookies,
    ip: '127.0.0.1',
    socket: {},
    correlationId: 'correlation-1',
    header: jest.fn((name: string) =>
      name === 'x-csrf-token' ? input.csrfHeader : 'synthetic-agent',
    ),
  } as unknown as Request & { correlationId: string };
}
