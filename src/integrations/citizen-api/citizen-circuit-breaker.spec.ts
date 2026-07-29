import { ConfigService } from '@nestjs/config';

import { AuthEnvironment } from '../../config/environment.validation';
import { CitizenCircuitBreaker } from './citizen-circuit-breaker';
import { CitizenProviderUnavailableError } from './citizen-provider.errors';

describe('CitizenCircuitBreaker', () => {
  const config = {
    get: jest.fn((key: keyof AuthEnvironment) => {
      if (key === 'CITIZEN_CIRCUIT_FAILURE_THRESHOLD') return 2;
      if (key === 'CITIZEN_CIRCUIT_RESET_TIMEOUT_MS') return 1_000;
      throw new Error(`Unexpected config key: ${key}`);
    }),
  } as unknown as ConfigService<AuthEnvironment, true>;

  it('opens after the threshold and permits only one recovery probe', () => {
    const circuit = new CitizenCircuitBreaker(config);

    circuit.recordFailure(1_000);
    circuit.recordFailure(1_100);
    expect(circuit.snapshot()).toEqual({
      state: 'open',
      consecutiveFailures: 2,
    });
    expect(() => circuit.assertRequestAllowed(1_500)).toThrow(
      CitizenProviderUnavailableError,
    );

    circuit.assertRequestAllowed(2_100);
    expect(() => circuit.assertRequestAllowed(2_100)).toThrow(
      CitizenProviderUnavailableError,
    );
    circuit.recordSuccess();
    expect(circuit.snapshot()).toEqual({
      state: 'closed',
      consecutiveFailures: 0,
    });
  });

  it('reopens when the half-open recovery probe fails', () => {
    const circuit = new CitizenCircuitBreaker(config);
    circuit.recordFailure(1_000);
    circuit.recordFailure(1_100);
    circuit.assertRequestAllowed(2_100);
    circuit.recordFailure(2_100);

    expect(() => circuit.assertRequestAllowed(2_500)).toThrow(
      CitizenProviderUnavailableError,
    );
  });
});
