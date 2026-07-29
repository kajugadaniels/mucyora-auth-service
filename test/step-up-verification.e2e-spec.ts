import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  SessionLevel,
  StepUpChallengeStatus,
  VerificationPurpose,
} from '@mucyora/db';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/common/database/database.service';
import { AccessAuthGuard } from '../src/modules/auth/access-auth.guard';
import { InternalServiceGuard } from '../src/modules/step-up-verification/internal-service.guard';
import { StepUpVerificationService } from '../src/modules/step-up-verification/step-up-verification.service';

describe('user and signature step-up contracts (e2e)', () => {
  let app: INestApplication<App>;
  const createChallenge = jest.fn();
  const consumeAssertion = jest.fn();

  beforeEach(async () => {
    createChallenge.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      verificationAttemptId: '33333333-3333-4333-8333-333333333333',
      purpose: VerificationPurpose.DEVICE_TRANSFER,
      status: StepUpChallengeStatus.PENDING,
      policyVersion: 'step-up-2026-07',
      expiresAt: new Date(Date.now() + 600_000),
    });
    consumeAssertion.mockResolvedValue({
      verified: true,
      userId: '11111111-1111-4111-8111-111111111111',
      purpose: VerificationPurpose.AGREEMENT_SIGNING,
      verificationAttemptId: '33333333-3333-4333-8333-333333333333',
    });
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({ isReady: jest.fn().mockResolvedValue(true) })
      .overrideProvider(StepUpVerificationService)
      .useValue({
        createChallenge,
        challenge: jest.fn(),
        issueAssertion: jest.fn(),
        consumeAssertion,
      })
      .overrideGuard(AccessAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp(): { getRequest(): Record<string, unknown> };
        }) => {
          context.switchToHttp().getRequest().auth = {
            sub: '11111111-1111-4111-8111-111111111111',
            sid: 'session-1',
            sessionLevel: SessionLevel.FULL,
          };
          return true;
        },
      })
      .overrideGuard(InternalServiceGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp(): {
            getRequest(): {
              header(name: string): string | undefined;
              internalService?: string;
            };
          };
        }) => {
          const request = context.switchToHttp().getRequest();
          request.internalService = request.header('x-mucyora-service-name');
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

  it('creates the api/user device-transfer challenge contract', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/step-up/challenges')
      .set('Authorization', 'Bearer synthetic')
      .send({
        purpose: VerificationPurpose.DEVICE_TRANSFER,
        targetResourceId: 'transfer-123',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          purpose: VerificationPurpose.DEVICE_TRANSFER,
          status: StepUpChallengeStatus.PENDING,
        });
        expect(body).not.toHaveProperty('targetResourceDigest');
      });
  });

  it('accepts the api/signature one-time assertion contract', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/internal/step-up/assertions/consume')
      .set('x-mucyora-service-name', 'mucyora-signature')
      .set('x-mucyora-service-key', 'synthetic-signature-service-key')
      .send({
        assertion: 'A'.repeat(64),
        userId: '11111111-1111-4111-8111-111111111111',
        purpose: VerificationPurpose.AGREEMENT_SIGNING,
        targetResourceId: 'agreement-123',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          verified: true,
          purpose: VerificationPurpose.AGREEMENT_SIGNING,
        });
      });
    expect(consumeAssertion).toHaveBeenCalledWith(
      'mucyora-signature',
      expect.objectContaining({ targetResourceId: 'agreement-123' }),
    );
  });

  afterEach(async () => {
    await app.close();
    createChallenge.mockReset();
    consumeAssertion.mockReset();
  });
});
