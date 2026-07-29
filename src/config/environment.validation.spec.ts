import {
  parseAllowedOrigins,
  validateEnvironment,
} from './environment.validation';

describe('environment validation', () => {
  const baseEnvironment = {
    APP_ENV: 'test',
    DATABASE_URL:
      'postgresql://mucyora_auth_app:placeholder@localhost:5432/mucyora',
    IDENTITY_ENCRYPTION_KEY_VERSION: 'v1',
    IDENTITY_ENCRYPTION_SECRET: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    IDENTITY_LOOKUP_KEY_VERSION: 'v1',
    IDENTITY_LOOKUP_HMAC_KEY: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE',
    TOKEN_DIGEST_HMAC_KEY: 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI',
    REQUEST_CONTEXT_HMAC_KEY: 'AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM',
  };

  it('applies safe defaults', () => {
    const environment = validateEnvironment(baseEnvironment);

    expect(environment.ENABLE_SWAGGER).toBe(false);
    expect(environment.CORS_ALLOWED_ORIGINS).toBe('http://localhost:4000');
    expect(environment.READINESS_CACHE_TTL_MS).toBe(5_000);
  });

  it('rejects wildcard CORS origins', () => {
    expect(() => parseAllowedOrigins('*')).toThrow('invalid CORS origin');
  });

  it('requires the least-privilege production database role', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        APP_ENV: 'production',
        DATABASE_URL:
          'postgresql://postgres:placeholder@localhost:5432/mucyora',
      }),
    ).toThrow('mucyora_auth_app');
  });

  it('requires strong documentation credentials when enabled in production', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        APP_ENV: 'production',
        ENABLE_SWAGGER: 'true',
        DOCS_BASIC_AUTH_USER: 'docs',
        DOCS_BASIC_AUTH_PASS: 'short',
      }),
    ).toThrow('password of at least 16 characters');
  });

  it('rejects reuse across purpose-separated keys', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        TOKEN_DIGEST_HMAC_KEY: baseEnvironment.IDENTITY_LOOKUP_HMAC_KEY,
      }),
    ).toThrow('must differ');
  });
});
