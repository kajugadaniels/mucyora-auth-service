/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';

import { AuthEnvironment } from '../../config/environment.validation';
import { EngineService } from './engine.service';

describe('EngineService', () => {
  it('signs a minimized replay-resistant request without an NID', async () => {
    const post = jest.fn().mockReturnValue(
      of({
        data: {
          decision: 'PASS',
          policyVersion: '2026-07-01',
          faceSimilarity: 92,
          livenessConfidence: 96,
          compositeScore: 93,
          documentBindingVerified: true,
          reasonCode: 'VERIFIED',
          evaluatedAt: new Date().toISOString(),
        },
      }),
    );
    const service = new EngineService(
      { post } as unknown as HttpService,
      configService(),
    );

    await service.evaluate({
      requestId: 'request-1',
      attemptId: 'attempt-1',
      userId: 'user-1',
      idDocumentReference: 'identity-verification/attempt-1/object',
      livenessSessionId: 'liveness-session-1',
      documentBindingVerified: true,
      policyVersion: '2026-07-01',
      idempotencyKey: 'attempt-1',
    });

    const body = JSON.parse(post.mock.calls[0][1] as string) as Record<
      string,
      unknown
    >;
    const options = post.mock.calls[0][2] as {
      headers: Record<string, string>;
    };
    expect(body).not.toHaveProperty('nid');
    expect(body).not.toHaveProperty('nationalId');
    expect(options.headers).toMatchObject({
      'x-mucyora-caller': 'mucyora-auth',
      'x-mucyora-audience': 'mucyora-engine',
    });
    expect(options.headers['x-mucyora-nonce']).toBeTruthy();
    expect(options.headers['x-mucyora-signature']).toBeTruthy();
  });
});

function configService(): ConfigService<AuthEnvironment, true> {
  const values: Partial<AuthEnvironment> = {
    MUCYORA_ENGINE_SERVICE_KEY:
      'test-engine-service-key-at-least-thirty-two-bytes',
    MUCYORA_ENGINE_TIMEOUT_MS: 45_000,
    MUCYORA_ENGINE_MAX_CONCURRENCY: 4,
  };
  return {
    get: jest.fn((key: keyof AuthEnvironment) => values[key]),
  } as unknown as ConfigService<AuthEnvironment, true>;
}
