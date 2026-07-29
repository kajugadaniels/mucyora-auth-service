import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common';

import { AuthEnvironment } from '../../config/environment.validation';
import {
  InternalServiceGuard,
  InternalServiceRequest,
} from './internal-service.guard';

describe('InternalServiceGuard', () => {
  it('authenticates a known service using its dedicated key', () => {
    const request = requestWith(
      'mucyora-signature',
      'signature-key-at-least-thirty-two-characters',
    );
    const guard = createGuard();

    expect(guard.canActivate(context(request))).toBe(true);
    expect(request.internalService).toBe('mucyora-signature');
  });

  it('rejects a key belonging to another service', () => {
    const guard = createGuard();

    expect(() =>
      guard.canActivate(
        context(
          requestWith(
            'mucyora-user',
            'signature-key-at-least-thirty-two-characters',
          ),
        ),
      ),
    ).toThrow('Authorized service authentication is required');
  });
});

function createGuard(): InternalServiceGuard {
  const values: Partial<AuthEnvironment> = {
    MUCYORA_USER_SERVICE_KEY: 'user-key-at-least-thirty-two-characters',
    MUCYORA_SIGNATURE_SERVICE_KEY:
      'signature-key-at-least-thirty-two-characters',
    MUCYORA_AUTH_RECOVERY_SERVICE_KEY:
      'recovery-key-at-least-thirty-two-characters',
  };
  return new InternalServiceGuard({
    get: jest.fn((key: keyof AuthEnvironment) => values[key]),
  } as unknown as ConfigService<AuthEnvironment, true>);
}

function requestWith(service: string, key: string): InternalServiceRequest {
  return {
    header: jest.fn((name: string) =>
      name === 'x-mucyora-service-name' ? service : key,
    ),
  } as unknown as InternalServiceRequest;
}

function context(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
