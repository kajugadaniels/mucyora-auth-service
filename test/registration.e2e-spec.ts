import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/common/database/database.service';
import { EmailVerificationService } from '../src/modules/email-verification/email-verification.service';
import { CitizenLookupService } from '../src/modules/registration/citizen-lookup.service';
import { RegistrationService } from '../src/modules/registration/registration.service';

describe('citizen registration initiation (e2e)', () => {
  let app: INestApplication<App>;
  const initiate = jest.fn();
  const register = jest.fn();
  const verify = jest.fn();
  const resend = jest.fn();

  beforeEach(async () => {
    initiate.mockResolvedValue({
      registrationChallengeToken: 'mrc1.opaque-token',
      expiresAt: '2026-07-29T20:10:00.000Z',
      citizen: {
        surname: 'Mucyo',
        givenNames: 'Ora',
        dateOfBirth: '1998-12-31',
        nationality: 'Rwanda',
        sex: 'F',
      },
    });
    register.mockResolvedValue({
      userReference: 'user-1',
      maskedEmail: 'us**@example.com',
      emailVerificationRequired: true,
      identityVerificationRequired: true,
      nextAction: 'VERIFY_EMAIL',
    });
    verify.mockResolvedValue({
      status: 'verified',
      nextAction: 'IDENTITY_VERIFICATION',
    });
    resend.mockResolvedValue({ status: 'accepted' });
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({ isReady: jest.fn().mockResolvedValue(true) })
      .overrideProvider(CitizenLookupService)
      .useValue({ initiate })
      .overrideProvider(RegistrationService)
      .useValue({ register })
      .overrideProvider(EmailVerificationService)
      .useValue({ verify, resend })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
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

  it('returns the Phase 4 contract without returning the NID', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/registration/citizen/lookup')
      .set('x-client-instance-id', 'client-instance-0001')
      .send({
        nid: '1000000000000001',
        email: 'user@example.com',
      })
      .expect(201);

    const body = response.body as {
      registrationChallengeToken: string;
    };
    expect(body.registrationChallengeToken).toBe('mrc1.opaque-token');
    expect(JSON.stringify(body)).not.toContain('1000000000000001');
  });

  it('rejects malformed identifiers and unknown fields', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/registration/citizen/lookup')
      .set('x-client-instance-id', 'client-instance-0001')
      .send({
        nid: '123',
        email: 'user@example.com',
        providerPayload: true,
      })
      .expect(400);

    expect(initiate).not.toHaveBeenCalled();
  });

  it('requires a bounded client-instance identifier', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/registration/citizen/lookup')
      .send({
        nid: '1000000000000001',
        email: 'user@example.com',
      })
      .expect(400);
  });

  it('accepts the Phase 5 atomic registration contract', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/registration')
      .set('idempotency-key', 'registration-request-0001')
      .send({
        registrationChallengeToken: `mrc1.${'A'.repeat(100)}`,
        email: 'user@example.com',
        password: 'Maple river lantern voyage 47!',
        consents: [
          { type: 'TERMS_OF_SERVICE', policyVersion: '2026-07-01' },
          { type: 'PRIVACY_POLICY', policyVersion: '2026-07-01' },
          {
            type: 'IDENTITY_DATA_PROCESSING',
            policyVersion: '2026-07-01',
          },
          { type: 'BIOMETRIC_PROCESSING', policyVersion: '2026-07-01' },
        ],
      })
      .expect(201);

    expect(response.body).toMatchObject({
      userReference: 'user-1',
      emailVerificationRequired: true,
      nextAction: 'VERIFY_EMAIL',
    });
    expect(JSON.stringify(response.body)).not.toContain('Maple river');
  });

  it('verifies email through a body token and accepts generic resends', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/registration/email/verify')
      .send({ token: 'A'.repeat(43) })
      .expect(200)
      .expect({
        status: 'verified',
        nextAction: 'IDENTITY_VERIFICATION',
      });

    await request(app.getHttpServer())
      .post('/api/v1/registration/email/resend')
      .send({ email: 'unknown@example.com' })
      .expect(202)
      .expect({ status: 'accepted' });
  });

  afterEach(async () => {
    await app.close();
    initiate.mockReset();
    register.mockReset();
    verify.mockReset();
    resend.mockReset();
  });
});
