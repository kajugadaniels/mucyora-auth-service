import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosHeaders, AxiosResponse } from 'axios';
import { Subject, of, throwError } from 'rxjs';

import { IdentityEncryptionService } from '../../common/security/identity-encryption.service';
import { KeyedDigestService } from '../../common/security/keyed-digest.service';
import { AuthEnvironment } from '../../config/environment.validation';
import type { CitizenCache } from './citizen-cache.service';
import { CitizenCircuitBreaker } from './citizen-circuit-breaker';
import { CitizenMetricsService } from './citizen-metrics.service';
import {
  CitizenNotFoundError,
  CitizenProviderUnavailableError,
} from './citizen-provider.errors';
import { CitizenRetryDelay, NidaCitizenAdapter } from './nida-citizen.adapter';
import { CitizenResponseMapper } from './citizen-response.mapper';

const nationalId = '1199887766554433';
const providerResponse = {
  status: 'ok',
  data: {
    nid: nationalId,
    surName: 'Mucyo',
    postNames: 'Ora',
    sex: 'F',
    dateOfBirth: '1998-12-31',
    countryOfBirth: 'Rwanda',
  },
};

describe('NidaCitizenAdapter', () => {
  let post: jest.Mock;
  let cache: jest.Mocked<CitizenCache>;
  let retryDelay: jest.MockedFunction<CitizenRetryDelay>;
  let adapter: NidaCitizenAdapter;
  let circuit: CitizenCircuitBreaker;
  let encryption: {
    seal: jest.Mock;
    open: jest.Mock;
  };

  beforeEach(() => {
    post = jest.fn();
    cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    retryDelay = jest.fn().mockResolvedValue(undefined);
    encryption = {
      seal: jest.fn().mockReturnValue('encrypted-cache-value'),
      open: jest.fn(),
    };
    const config = configService();
    circuit = new CitizenCircuitBreaker(config);
    adapter = new NidaCitizenAdapter(
      { post } as unknown as HttpService,
      config,
      {
        identityLookup: jest.fn().mockReturnValue('v1:safe-digest'),
      } as unknown as KeyedDigestService,
      encryption as unknown as IdentityEncryptionService,
      new CitizenResponseMapper(),
      circuit,
      { record: jest.fn() } as unknown as CitizenMetricsService,
      cache,
      retryDelay,
    );
  });

  it('returns a validated encrypted-cache hit without calling the provider', async () => {
    cache.get.mockResolvedValue('encrypted-cache-value');
    encryption.open.mockReturnValue(
      JSON.stringify({
        providerReference: null,
        nationality: 'Rwanda',
        surname: 'Mucyo',
        givenNames: 'Ora',
        dateOfBirth: '1998-12-31',
        sex: 'F',
        documentStatus: 'ACTIVE',
        portraitReference: null,
        sourceUpdatedAt: null,
      }),
    );

    await expect(
      adapter.findByNationalId(nationalId, {
        correlationId: 'request-1',
      }),
    ).resolves.toMatchObject({ surname: 'Mucyo' });
    expect(post).not.toHaveBeenCalled();
    expect(encryption.open).toHaveBeenCalledWith(
      'encrypted-cache-value',
      'citizen-snapshot',
    );
  });

  it('uses fixed request settings and never exposes the provider NID', async () => {
    post.mockReturnValue(of({ data: providerResponse }));

    const result = await adapter.findByNationalId(nationalId, {
      correlationId: 'request-1',
    });

    expect(result.surname).toBe('Mucyo');
    expect(JSON.stringify(result)).not.toContain(nationalId);
    expect(post).toHaveBeenCalledWith(
      '',
      {
        documentType: 'NID',
        documentNumber: nationalId,
        fosaid: '0022',
      },
      expect.objectContaining({
        auth: { username: 'provider-user', password: 'provider-password' },
        maxRedirects: 0,
        timeout: 2_000,
      }),
    );
    expect(cache.set.mock.calls).toContainEqual([
      'mucyora:auth:citizen:nida:v1:safe-digest',
      'encrypted-cache-value',
      300,
    ]);
    expect(cache.set.mock.calls[0]?.[0]).not.toContain(nationalId);
  });

  it('coalesces concurrent requests for the same identifier', async () => {
    const response = new Subject<unknown>();
    post.mockReturnValue(response);

    const first = adapter.findByNationalId(nationalId, {
      correlationId: 'request-1',
    });
    const second = adapter.findByNationalId(nationalId, {
      correlationId: 'request-2',
    });
    while (post.mock.calls.length === 0) {
      await Promise.resolve();
    }
    response.next({ data: providerResponse });
    response.complete();

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('bounds retryable failures and applies backoff', async () => {
    post.mockReturnValue(
      throwError(() => axiosFailure(503, 'ERR_BAD_RESPONSE')),
    );

    await expect(
      adapter.findByNationalId(nationalId, {
        correlationId: 'request-1',
      }),
    ).rejects.toThrow(CitizenProviderUnavailableError);
    expect(post).toHaveBeenCalledTimes(3);
    expect(retryDelay).toHaveBeenNthCalledWith(1, 100);
    expect(retryDelay).toHaveBeenNthCalledWith(2, 200);
  });

  it('does not retry not-found responses', async () => {
    post.mockReturnValue(
      throwError(() => axiosFailure(404, 'ERR_BAD_REQUEST')),
    );

    await expect(
      adapter.findByNationalId(nationalId, {
        correlationId: 'request-1',
      }),
    ).rejects.toThrow(CitizenNotFoundError);
    expect(post).toHaveBeenCalledTimes(1);
    expect(retryDelay).not.toHaveBeenCalled();
    expect(circuit.snapshot().state).toBe('closed');
  });

  it('treats response timeouts as retryable without leaking details', async () => {
    post.mockReturnValue(
      throwError(() => axiosFailure(undefined, 'ECONNABORTED')),
    );

    await expect(
      adapter.findByNationalId(nationalId, {
        correlationId: 'request-1',
      }),
    ).rejects.toMatchObject({
      code: 'CITIZEN_PROVIDER_UNAVAILABLE',
      message: 'Citizen identity service is temporarily unavailable',
    });
    expect(post).toHaveBeenCalledTimes(3);
  });
});

function configService(): ConfigService<AuthEnvironment, true> {
  const values: Partial<AuthEnvironment> = {
    CACHE_PREFIX: 'mucyora:auth:',
    CITIZEN_API_FOSA_ID: '0022',
    CITIZEN_API_USERNAME: 'provider-user',
    CITIZEN_API_PASSWORD: 'provider-password',
    CITIZEN_API_RESPONSE_TIMEOUT_MS: 2_000,
    CITIZEN_API_MAX_RETRIES: 2,
    CITIZEN_CACHE_TTL_SECONDS: 300,
    CITIZEN_CIRCUIT_FAILURE_THRESHOLD: 5,
    CITIZEN_CIRCUIT_RESET_TIMEOUT_MS: 30_000,
  };

  return {
    get: jest.fn((key: keyof AuthEnvironment) => values[key]),
  } as unknown as ConfigService<AuthEnvironment, true>;
}

function axiosFailure(status: number | undefined, code: string): AxiosError {
  const response: AxiosResponse | undefined =
    status === undefined
      ? undefined
      : {
          data: {},
          status,
          statusText: 'Provider failure',
          headers: {},
          config: { headers: new AxiosHeaders() },
        };

  return new AxiosError(
    'sensitive upstream diagnostic',
    code,
    undefined,
    undefined,
    response,
  );
}
