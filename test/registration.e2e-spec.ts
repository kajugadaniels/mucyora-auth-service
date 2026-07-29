import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/common/database/database.service';
import { CitizenLookupService } from '../src/modules/registration/citizen-lookup.service';

describe('citizen registration initiation (e2e)', () => {
  let app: INestApplication<App>;
  const initiate = jest.fn();

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
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({ isReady: jest.fn().mockResolvedValue(true) })
      .overrideProvider(CitizenLookupService)
      .useValue({ initiate })
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

  afterEach(async () => {
    await app.close();
    initiate.mockReset();
  });
});
