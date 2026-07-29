import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/common/database/database.service';
import { AuthenticationService } from '../src/modules/auth/authentication.service';
import { PasswordService } from '../src/modules/password/password.service';

describe('authentication contracts (e2e)', () => {
  let app: INestApplication<App>;
  const login = jest.fn();
  const refresh = jest.fn();
  const forgotPassword = jest.fn();
  const resetPassword = jest.fn();

  beforeEach(async () => {
    login.mockImplementation((input: { transport: string }) =>
      Promise.resolve({
        response: {
          accessToken: 'signed-access-token',
          expiresIn: 900,
          sessionLevel: 'LIMITED',
          identityVerified: false,
          ...(input.transport === 'NATIVE'
            ? { refreshToken: 'native-refresh-token' }
            : {}),
        },
        refreshToken: 'cookie-refresh-token',
        csrfToken: 'csrf-token',
        transport: input.transport,
      }),
    );
    refresh.mockResolvedValue({
      response: {
        accessToken: 'rotated-access-token',
        refreshToken: 'rotated-refresh-token',
        expiresIn: 900,
        sessionLevel: 'LIMITED',
        identityVerified: false,
      },
      refreshToken: 'rotated-refresh-token',
      csrfToken: 'rotated-csrf-token',
      transport: 'NATIVE',
    });
    forgotPassword.mockResolvedValue({ status: 'accepted' });
    resetPassword.mockResolvedValue({ status: 'changed' });
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({ isReady: jest.fn().mockResolvedValue(true) })
      .overrideProvider(AuthenticationService)
      .useValue({ login, refresh })
      .overrideProvider(PasswordService)
      .useValue({
        forgot: forgotPassword,
        reset: resetPassword,
        change: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1', {
      exclude: [{ path: '.well-known/jwks.json', method: RequestMethod.GET }],
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
        transform: true,
      }),
    );
    await app.init();
  });

  it('returns native compatibility tokens only when explicitly requested', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'user@example.com',
        password: 'synthetic-password',
        deviceId: 'device-instance-0001',
        transport: 'NATIVE',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          accessToken: 'signed-access-token',
          refreshToken: 'native-refresh-token',
          sessionLevel: 'LIMITED',
        });
      });
  });

  it('sets secure cookie-mode refresh and CSRF cookies', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'user@example.com',
        password: 'synthetic-password',
        deviceId: 'device-instance-0001',
        transport: 'COOKIE',
      })
      .expect(200);

    expect(response.body).not.toHaveProperty('refreshToken');
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('mucyora_refresh='),
        expect.stringContaining('mucyora_csrf='),
      ]),
    );
  });

  it('rejects cookie refresh without double-submit CSRF evidence', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', [
        'mucyora_refresh=cookie-refresh-token',
        'mucyora_csrf=csrf-token',
      ])
      .send({ transport: 'COOKIE' })
      .expect(401);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('serves cacheable public RSA JWKS outside the API prefix', async () => {
    const response = await request(app.getHttpServer())
      .get('/.well-known/jwks.json')
      .expect(200)
      .expect('Cache-Control', /max-age=300/);

    const body = response.body as {
      keys: Array<Record<string, unknown>>;
    };
    expect(body.keys[0]).toMatchObject({
      kty: 'RSA',
      alg: 'RS256',
      use: 'sig',
    });
    expect(body.keys[0]).not.toHaveProperty('d');
  });

  it('returns a generic password recovery response', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/password/forgot')
      .send({ email: 'user@example.com' })
      .expect(200)
      .expect({ status: 'accepted' });
    expect(forgotPassword).toHaveBeenCalled();
  });

  it('accepts the password reset contract without exposing token state', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/password/reset')
      .send({
        token: 'A'.repeat(43),
        newPassword: 'A different secure voyage phrase 47!',
      })
      .expect(200)
      .expect({ status: 'changed' });
    expect(resetPassword).toHaveBeenCalled();
  });

  afterEach(async () => {
    await app.close();
    login.mockReset();
    refresh.mockReset();
    forgotPassword.mockReset();
    resetPassword.mockReset();
  });
});
