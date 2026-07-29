import { generateKeyPairSync } from 'node:crypto';
import {
  parseAllowedOrigins,
  validateEnvironment,
} from './environment.validation';

describe('environment validation', () => {
  const signingKeys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
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
    REDIS_URL: 'redis://localhost:6379',
    CITIZEN_API_URL: 'http://localhost:3100/citizens/lookup',
    CITIZEN_API_USERNAME: 'test-client',
    CITIZEN_API_PASSWORD: 'test-password',
    MUCYORA_AUTH_ISSUER: 'http://localhost:3000',
    MUCYORA_AUTH_ACCESS_AUDIENCES: 'mucyora-user',
    MUCYORA_AUTH_SIGNING_KEY_ID: 'test-key-2026',
    MUCYORA_AUTH_SIGNING_PRIVATE_KEY: signingKeys.privateKey,
    MUCYORA_AUTH_SIGNING_PUBLIC_KEY: signingKeys.publicKey,
    AWS_S3_VERIFICATION_BUCKET: 'mucyora-verification-test',
    VERIFICATION_POLICY_VERSION: '2026-07-01',
    MUCYORA_ENGINE_URL: 'http://localhost:8000',
    MUCYORA_ENGINE_SERVICE_KEY:
      'test-engine-service-key-at-least-thirty-two-bytes',
    STEP_UP_POLICY_VERSION: 'step-up-2026-07',
    MUCYORA_USER_SERVICE_KEY: 'test-user-service-key-at-least-thirty-two-bytes',
    MUCYORA_SIGNATURE_SERVICE_KEY:
      'test-signature-service-key-at-least-thirty-two',
    MUCYORA_AUTH_RECOVERY_SERVICE_KEY:
      'test-auth-recovery-key-at-least-thirty-two',
    MUCYORA_OPERATIONS_SERVICE_KEY: 'test-operations-key-at-least-thirty-two',
  };

  it('applies safe defaults', () => {
    const environment = validateEnvironment(baseEnvironment);

    expect(environment.ENABLE_SWAGGER).toBe(false);
    expect(environment.CORS_ALLOWED_ORIGINS).toBe('http://localhost:4000');
    expect(environment.READINESS_CACHE_TTL_MS).toBe(5_000);
    expect(environment.REGISTRATION_CHALLENGE_TTL_SECONDS).toBe(600);
    expect(environment.REGISTRATION_CHALLENGE_MAX_ATTEMPTS).toBe(3);
    expect(environment.SESSION_UPGRADE_IDEMPOTENCY_TTL_SECONDS).toBe(900);
    expect(environment.STEP_UP_CHALLENGE_TTL_SECONDS).toBe(600);
    expect(environment.STEP_UP_ASSERTION_TTL_SECONDS).toBe(300);
    expect(environment.OPERATIONAL_JOB_BATCH_SIZE).toBe(50);
    expect(environment.OUTBOX_DELIVERY_CONCURRENCY).toBe(4);
    expect(environment.SECURITY_EVENT_RETENTION_DAYS).toBe(365);
    expect(environment.MUCYORA_AUTH_PREVIOUS_SIGNING_PUBLIC_KEYS_JSON).toBe(
      '[]',
    );
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

  it('rejects provider credentials embedded in the URL', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        CITIZEN_API_URL: 'https://client:secret@identity.example/lookup',
      }),
    ).toThrow('without credentials');
  });

  it('requires encrypted provider transport in production', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        APP_ENV: 'production',
      }),
    ).toThrow('CITIZEN_API_URL must use HTTPS');
  });

  it('rejects long-lived registration challenges', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        REGISTRATION_CHALLENGE_TTL_SECONDS: 901,
      }),
    ).toThrow('REGISTRATION_CHALLENGE_TTL_SECONDS');
  });

  it('requires complete mail configuration when the worker is enabled', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        MAIL_OUTBOX_WORKER_ENABLED: true,
      }),
    ).toThrow('enabled mail worker requires');
  });

  it('rejects private material in the JWT verification overlap ring', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        MUCYORA_AUTH_PREVIOUS_SIGNING_PUBLIC_KEYS_JSON: JSON.stringify([
          {
            keyId: 'previous-key-2026',
            publicKey: signingKeys.privateKey,
          },
        ]),
      }),
    ).toThrow('Auth signing keys must be valid RSA PEM keys');
  });
});
