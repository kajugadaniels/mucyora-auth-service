import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SessionLevel, VerificationAttemptStatus } from '@mucyora/db';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/common/database/database.service';
import { AccessAuthGuard } from '../src/modules/auth/access-auth.guard';
import { IdentityVerificationService } from '../src/modules/identity-verification/identity-verification.service';

describe('identity verification contracts (e2e)', () => {
  let app: INestApplication<App>;
  const createAttempt = jest.fn();
  const status = jest.fn();

  beforeEach(async () => {
    createAttempt.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      status: VerificationAttemptStatus.MEDIA_PENDING,
      attemptNumber: 1,
      policyVersion: '2026-07-01',
      retryAfter: null,
      reasonCode: null,
    });
    status.mockResolvedValue({
      identityVerificationStatus: 'PENDING',
      latestAttempt: null,
    });
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({ isReady: jest.fn().mockResolvedValue(true) })
      .overrideProvider(IdentityVerificationService)
      .useValue({
        createAttempt,
        status,
        createUploadPolicy: jest.fn(),
        confirmUpload: jest.fn(),
        createLivenessSession: jest.fn(),
        submit: jest.fn(),
        attempt: jest.fn(),
      })
      .overrideGuard(AccessAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp(): { getRequest(): Record<string, unknown> };
        }) => {
          context.switchToHttp().getRequest().auth = {
            sub: 'user-1',
            sid: 'session-1',
            jti: 'token-1',
            sessionLevel: SessionLevel.LIMITED,
          };
          return true;
        },
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

  it('allows a limited session to create an account-enrollment attempt', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/identity-verification/attempts')
      .set('Authorization', 'Bearer synthetic')
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: VerificationAttemptStatus.MEDIA_PENDING,
          attemptNumber: 1,
        });
      });
  });

  it('returns only minimized account verification status', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/identity-verification/status')
      .set('Authorization', 'Bearer synthetic')
      .expect(200)
      .expect({
        identityVerificationStatus: 'PENDING',
        latestAttempt: null,
      });
  });

  afterEach(async () => {
    await app.close();
    createAttempt.mockReset();
    status.mockReset();
  });
});
