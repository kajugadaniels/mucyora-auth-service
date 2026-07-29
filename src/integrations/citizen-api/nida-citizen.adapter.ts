import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import { IdentityEncryptionService } from '../../common/security/identity-encryption.service';
import { KeyedDigestService } from '../../common/security/keyed-digest.service';
import { normalizeRwandaNid } from '../../common/security/normalization';
import { AuthEnvironment } from '../../config/environment.validation';
import { CITIZEN_CACHE } from './citizen-cache.service';
import type { CitizenCache } from './citizen-cache.service';
import { CitizenCircuitBreaker } from './citizen-circuit-breaker';
import {
  CitizenIdentityProvider,
  CitizenIdentityResult,
  CitizenLookupContext,
} from './citizen-identity-provider';
import { CitizenMetricsService } from './citizen-metrics.service';
import {
  CitizenNotFoundError,
  CitizenProviderResponseError,
  CitizenProviderUnavailableError,
} from './citizen-provider.errors';
import { CitizenResponseMapper } from './citizen-response.mapper';

export const CITIZEN_RETRY_DELAY = Symbol('CITIZEN_RETRY_DELAY');
export type CitizenRetryDelay = (milliseconds: number) => Promise<void>;

export const defaultCitizenRetryDelay: CitizenRetryDelay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

@Injectable()
export class NidaCitizenAdapter implements CitizenIdentityProvider {
  private readonly inFlight = new Map<string, Promise<CitizenIdentityResult>>();

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<AuthEnvironment, true>,
    private readonly digests: KeyedDigestService,
    private readonly encryption: IdentityEncryptionService,
    private readonly mapper: CitizenResponseMapper,
    private readonly circuitBreaker: CitizenCircuitBreaker,
    private readonly metrics: CitizenMetricsService,
    @Inject(CITIZEN_CACHE) private readonly cache: CitizenCache,
    @Inject(CITIZEN_RETRY_DELAY)
    private readonly retryDelay: CitizenRetryDelay,
  ) {}

  async findByNationalId(
    nationalId: string,
    context: CitizenLookupContext,
  ): Promise<CitizenIdentityResult> {
    const normalizedNationalId = normalizeRwandaNid(nationalId);
    const lookupDigest = this.digests.identityLookup(normalizedNationalId);
    const cacheKey = `${this.config.get('CACHE_PREFIX', {
      infer: true,
    })}citizen:nida:${lookupDigest}`;
    const startedAt = Date.now();
    const cached = await this.readCache(cacheKey, context);

    if (cached) {
      this.metrics.record({
        outcome: 'cache_hit',
        durationMs: Date.now() - startedAt,
        correlationId: context.correlationId,
      });
      return cached;
    }

    this.metrics.record({
      outcome: 'cache_miss',
      durationMs: Date.now() - startedAt,
      correlationId: context.correlationId,
    });

    const existing = this.inFlight.get(lookupDigest);
    if (existing) {
      return existing;
    }

    const request = this.fetchAndCache(
      normalizedNationalId,
      cacheKey,
      context,
    ).finally(() => {
      this.inFlight.delete(lookupDigest);
    });

    this.inFlight.set(lookupDigest, request);
    return request;
  }

  private async fetchAndCache(
    nationalId: string,
    cacheKey: string,
    context: CitizenLookupContext,
  ): Promise<CitizenIdentityResult> {
    const startedAt = Date.now();
    this.circuitBreaker.assertRequestAllowed();

    try {
      const result = await this.requestWithRetries(nationalId, context);
      this.circuitBreaker.recordSuccess();
      await this.writeCache(cacheKey, result);
      this.metrics.record({
        outcome: 'success',
        durationMs: Date.now() - startedAt,
        correlationId: context.correlationId,
      });
      return result;
    } catch (error) {
      if (error instanceof CitizenNotFoundError) {
        this.circuitBreaker.recordSuccess();
        this.metrics.record({
          outcome: 'not_found',
          durationMs: Date.now() - startedAt,
          correlationId: context.correlationId,
        });
        throw error;
      }

      this.circuitBreaker.recordFailure();
      this.metrics.record({
        outcome:
          error instanceof CitizenProviderResponseError
            ? 'invalid_response'
            : 'unavailable',
        durationMs: Date.now() - startedAt,
        correlationId: context.correlationId,
      });

      if (error instanceof CitizenProviderResponseError) {
        throw error;
      }
      throw new CitizenProviderUnavailableError();
    }
  }

  private async requestWithRetries(
    nationalId: string,
    context: CitizenLookupContext,
  ): Promise<CitizenIdentityResult> {
    const maximumRetries = this.config.get('CITIZEN_API_MAX_RETRIES', {
      infer: true,
    });

    for (let attempt = 0; attempt <= maximumRetries; attempt += 1) {
      try {
        const response = await firstValueFrom(
          this.http.post(
            '',
            {
              documentType: 'NID',
              documentNumber: nationalId,
              fosaid: this.config.get('CITIZEN_API_FOSA_ID', { infer: true }),
            },
            {
              auth: {
                username: this.config.get('CITIZEN_API_USERNAME', {
                  infer: true,
                }),
                password: this.config.get('CITIZEN_API_PASSWORD', {
                  infer: true,
                }),
              },
              headers: {
                'content-type': 'application/json',
                'x-correlation-id': context.correlationId,
              },
              maxRedirects: 0,
              timeout: this.config.get('CITIZEN_API_RESPONSE_TIMEOUT_MS', {
                infer: true,
              }),
            },
          ),
        );

        return this.mapper.fromProvider(response.data);
      } catch (error) {
        const classified = this.classifyError(error);

        if (!classified.retryable || attempt === maximumRetries) {
          throw classified.error;
        }

        this.metrics.record({
          outcome: 'unavailable',
          durationMs: 0,
          correlationId: context.correlationId,
          attempt: attempt + 1,
        });
        await this.retryDelay(this.backoffMilliseconds(attempt));
      }
    }

    throw new CitizenProviderUnavailableError();
  }

  private classifyError(error: unknown): {
    error: Error;
    retryable: boolean;
  } {
    if (
      error instanceof CitizenNotFoundError ||
      error instanceof CitizenProviderResponseError
    ) {
      return { error, retryable: false };
    }

    if (!(error instanceof AxiosError)) {
      return {
        error: new CitizenProviderUnavailableError(),
        retryable: false,
      };
    }

    const status = error.response?.status;
    if (status === 400 || status === 404) {
      return { error: new CitizenNotFoundError(), retryable: false };
    }

    const retryable =
      status === 429 ||
      (status !== undefined && status >= 500) ||
      ['ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(
        error.code ?? '',
      );

    return {
      error: new CitizenProviderUnavailableError(),
      retryable,
    };
  }

  private backoffMilliseconds(attempt: number): number {
    return Math.min(100 * 2 ** attempt, 1_000);
  }

  private async readCache(
    cacheKey: string,
    context: CitizenLookupContext,
  ): Promise<CitizenIdentityResult | null> {
    try {
      const encrypted = await this.cache.get(cacheKey);
      if (!encrypted) {
        return null;
      }

      const plaintext = this.encryption.open(encrypted, 'citizen-snapshot');
      return this.mapper.fromCache(plaintext);
    } catch {
      this.metrics.record({
        outcome: 'unavailable',
        durationMs: 0,
        correlationId: context.correlationId,
      });
      await this.deleteCache(cacheKey);
      return null;
    }
  }

  private async writeCache(
    cacheKey: string,
    result: CitizenIdentityResult,
  ): Promise<void> {
    try {
      const encrypted = this.encryption.seal(
        JSON.stringify(result),
        'citizen-snapshot',
      );
      await this.cache.set(
        cacheKey,
        encrypted,
        this.config.get('CITIZEN_CACHE_TTL_SECONDS', { infer: true }),
      );
    } catch {
      // Cache availability must not change the identity-provider result.
    }
  }

  private async deleteCache(cacheKey: string): Promise<void> {
    try {
      await this.cache.delete(cacheKey);
    } catch {
      // A failed cleanup is safe because unreadable cache entries are ignored.
    }
  }
}
