import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthEnvironment } from '../../config/environment.validation';
import { CitizenProviderUnavailableError } from './citizen-provider.errors';

type CircuitState = 'closed' | 'open' | 'half-open';

@Injectable()
export class CitizenCircuitBreaker {
  private consecutiveFailures = 0;
  private openedAt = 0;
  private halfOpenRequestInProgress = false;
  private state: CircuitState = 'closed';

  constructor(
    private readonly configService: ConfigService<AuthEnvironment, true>,
  ) {}

  assertRequestAllowed(now = Date.now()): void {
    if (this.state === 'closed') {
      return;
    }

    if (this.state === 'open') {
      const resetAfterMs = this.configService.get(
        'CITIZEN_CIRCUIT_RESET_TIMEOUT_MS',
        { infer: true },
      );

      if (now - this.openedAt < resetAfterMs) {
        throw new CitizenProviderUnavailableError();
      }

      this.state = 'half-open';
    }

    if (this.halfOpenRequestInProgress) {
      throw new CitizenProviderUnavailableError();
    }

    this.halfOpenRequestInProgress = true;
  }

  recordSuccess(): void {
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.openedAt = 0;
    this.halfOpenRequestInProgress = false;
  }

  recordFailure(now = Date.now()): void {
    this.halfOpenRequestInProgress = false;
    this.consecutiveFailures += 1;

    const threshold = this.configService.get(
      'CITIZEN_CIRCUIT_FAILURE_THRESHOLD',
      { infer: true },
    );

    if (this.state === 'half-open' || this.consecutiveFailures >= threshold) {
      this.state = 'open';
      this.openedAt = now;
    }
  }

  snapshot(): Readonly<{
    state: CircuitState;
    consecutiveFailures: number;
  }> {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
    };
  }
}
