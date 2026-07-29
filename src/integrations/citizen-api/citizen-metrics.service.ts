import { Injectable, Logger } from '@nestjs/common';

export type CitizenProviderOutcome =
  | 'cache_hit'
  | 'cache_miss'
  | 'success'
  | 'not_found'
  | 'unavailable'
  | 'invalid_response';

@Injectable()
export class CitizenMetricsService {
  private readonly logger = new Logger(CitizenMetricsService.name);

  record(input: {
    outcome: CitizenProviderOutcome;
    durationMs: number;
    correlationId: string;
    attempt?: number;
  }): void {
    this.logger.log({
      message: 'Citizen provider operation',
      event: 'citizen_provider_operation',
      outcome: input.outcome,
      durationMs: input.durationMs,
      correlationId: input.correlationId,
      attempt: input.attempt,
    });
  }
}
