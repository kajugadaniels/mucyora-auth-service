import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import Joi from 'joi';

const environmentSchema = Joi.object({
  APP_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'log', 'debug', 'verbose')
    .default('log'),
  CORS_ALLOWED_ORIGINS: Joi.string().default('http://localhost:4000'),
  ENABLE_SWAGGER: Joi.boolean().truthy('true').falsy('false').default(false),
  DOCS_BASIC_AUTH_USER: Joi.string().allow('').default(''),
  DOCS_BASIC_AUTH_PASS: Joi.string().allow('').default(''),
  READINESS_CACHE_TTL_MS: Joi.number()
    .integer()
    .min(250)
    .max(30_000)
    .default(5_000),
  IDENTITY_ENCRYPTION_PROVIDER: Joi.string()
    .valid('SOFTWARE_GCM')
    .default('SOFTWARE_GCM'),
  IDENTITY_ENCRYPTION_KEY_VERSION: Joi.string()
    .pattern(/^v[1-9]\d*$/)
    .required(),
  IDENTITY_ENCRYPTION_SECRET: Joi.string().min(43).required(),
  IDENTITY_LOOKUP_KEY_VERSION: Joi.string()
    .pattern(/^v[1-9]\d*$/)
    .required(),
  IDENTITY_LOOKUP_HMAC_KEY: Joi.string().min(43).required(),
  TOKEN_DIGEST_HMAC_KEY: Joi.string().min(43).required(),
  REQUEST_CONTEXT_HMAC_KEY: Joi.string().min(43).required(),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),
  CACHE_PREFIX: Joi.string()
    .pattern(/^[a-z0-9:_-]{1,64}$/)
    .default('mucyora:auth:'),
  CITIZEN_API_URL: Joi.string().uri().required(),
  CITIZEN_API_USERNAME: Joi.string().min(1).max(256).required(),
  CITIZEN_API_PASSWORD: Joi.string().min(8).max(512).required(),
  CITIZEN_API_FOSA_ID: Joi.string()
    .pattern(/^\d{4}$/)
    .default('0022'),
  CITIZEN_API_CONNECT_TIMEOUT_MS: Joi.number()
    .integer()
    .min(250)
    .max(30_000)
    .default(3_000),
  CITIZEN_API_RESPONSE_TIMEOUT_MS: Joi.number()
    .integer()
    .min(500)
    .max(60_000)
    .default(10_000),
  CITIZEN_API_MAX_RETRIES: Joi.number().integer().min(0).max(3).default(2),
  CITIZEN_CACHE_TTL_SECONDS: Joi.number()
    .integer()
    .min(30)
    .max(3_600)
    .default(300),
  CITIZEN_CIRCUIT_FAILURE_THRESHOLD: Joi.number()
    .integer()
    .min(2)
    .max(20)
    .default(5),
  CITIZEN_CIRCUIT_RESET_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1_000)
    .max(300_000)
    .default(30_000),
  CITIZEN_LOOKUP_IP_LIMIT_PER_MINUTE: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(5),
  CITIZEN_LOOKUP_CLIENT_LIMIT_PER_MINUTE: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(5),
  CITIZEN_LOOKUP_NID_LIMIT_PER_MINUTE: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(3),
  REGISTRATION_CHALLENGE_TTL_SECONDS: Joi.number()
    .integer()
    .min(120)
    .max(900)
    .default(600),
  REGISTRATION_CHALLENGE_MAX_ATTEMPTS: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .default(3),
  PASSWORD_ARGON2_MEMORY_KIB: Joi.number()
    .integer()
    .min(32_768)
    .max(262_144)
    .default(65_536),
  PASSWORD_ARGON2_TIME_COST: Joi.number().integer().min(2).max(10).default(3),
  PASSWORD_ARGON2_PARALLELISM: Joi.number().integer().min(1).max(4).default(1),
  PASSWORD_HASH_MAX_CONCURRENCY: Joi.number()
    .integer()
    .min(1)
    .max(16)
    .default(4),
  PASSWORD_RESET_TOKEN_TTL_SECONDS: Joi.number()
    .integer()
    .min(300)
    .max(3_600)
    .default(900),
  PASSWORD_RESET_LIMIT_PER_HOUR: Joi.number()
    .integer()
    .min(1)
    .max(20)
    .default(3),
  PASSWORD_CHANGE_LIMIT_PER_HOUR: Joi.number()
    .integer()
    .min(1)
    .max(20)
    .default(5),
  EMAIL_TOKEN_TTL_SECONDS: Joi.number()
    .integer()
    .min(900)
    .max(172_800)
    .default(86_400),
  REGISTRATION_LIMIT_PER_HOUR: Joi.number().integer().min(1).max(20).default(3),
  EMAIL_RESEND_LIMIT_PER_HOUR: Joi.number().integer().min(1).max(20).default(3),
  MAIL_OUTBOX_WORKER_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),
  MAIL_PROVIDER_URL: Joi.string().allow('').default(''),
  MAIL_FROM: Joi.string().email().allow('').default(''),
  MAIL_API_KEY: Joi.string().allow('').default(''),
  MUCYORA_USER_APP_URL: Joi.string().uri().default('http://localhost:4000'),
  MAIL_PROVIDER_TIMEOUT_MS: Joi.number()
    .integer()
    .min(500)
    .max(30_000)
    .default(5_000),
  OUTBOX_POLL_INTERVAL_MS: Joi.number()
    .integer()
    .min(1_000)
    .max(60_000)
    .default(5_000),
  OUTBOX_BATCH_SIZE: Joi.number().integer().min(1).max(100).default(20),
  MUCYORA_AUTH_ISSUER: Joi.string().uri().required(),
  MUCYORA_AUTH_ACCESS_AUDIENCES: Joi.string().min(1).required(),
  MUCYORA_AUTH_SIGNING_KEY_ID: Joi.string()
    .pattern(/^[A-Za-z0-9._:-]{8,128}$/)
    .required(),
  MUCYORA_AUTH_SIGNING_PRIVATE_KEY: Joi.string().min(256).required(),
  MUCYORA_AUTH_SIGNING_PUBLIC_KEY: Joi.string().min(128).required(),
  ACCESS_TOKEN_TTL_SECONDS: Joi.number()
    .integer()
    .min(300)
    .max(1_800)
    .default(900),
  LIMITED_ACCESS_TOKEN_TTL_SECONDS: Joi.number()
    .integer()
    .min(300)
    .max(7_200)
    .default(900),
  REFRESH_TOKEN_TTL_SECONDS: Joi.number()
    .integer()
    .min(86_400)
    .max(7_776_000)
    .default(2_592_000),
  REFRESH_REPLAY_GRACE_SECONDS: Joi.number()
    .integer()
    .min(1)
    .max(30)
    .default(10),
  LOGIN_LIMIT_PER_MINUTE: Joi.number().integer().min(1).max(50).default(5),
  REFRESH_LIMIT_PER_MINUTE: Joi.number().integer().min(1).max(100).default(10),
  LOGIN_LOCK_THRESHOLD: Joi.number().integer().min(5).max(50).default(10),
  LOGIN_LOCK_SECONDS: Joi.number().integer().min(60).max(3_600).default(900),
  COOKIE_DOMAIN: Joi.string().allow('').default(''),
  COOKIE_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  COOKIE_SAME_SITE: Joi.string().valid('lax', 'strict', 'none').default('lax'),
  REFRESH_COOKIE_NAME: Joi.string()
    .pattern(/^[A-Za-z0-9_-]{1,64}$/)
    .default('mucyora_refresh'),
  CSRF_COOKIE_NAME: Joi.string()
    .pattern(/^[A-Za-z0-9_-]{1,64}$/)
    .default('mucyora_csrf'),
  AWS_REGION: Joi.string().min(3).max(64).default('eu-west-1'),
  AWS_S3_VERIFICATION_BUCKET: Joi.string().min(3).max(63).required(),
  AWS_S3_VERIFICATION_PREFIX: Joi.string()
    .pattern(/^[A-Za-z0-9/_-]{1,128}\/$/)
    .default('identity-verification/'),
  AWS_S3_ENDPOINT: Joi.string().uri().allow('').default(''),
  AWS_S3_FORCE_PATH_STYLE: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),
  AWS_ACCESS_KEY_ID: Joi.string().allow('').default(''),
  AWS_SECRET_ACCESS_KEY: Joi.string().allow('').default(''),
  AWS_SESSION_TOKEN: Joi.string().allow('').default(''),
  VERIFICATION_UPLOAD_TTL_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(900)
    .default(300),
  VERIFICATION_MEDIA_MAX_SIZE_BYTES: Joi.number()
    .integer()
    .min(65_536)
    .max(10_485_760)
    .default(5_242_880),
  VERIFICATION_MEDIA_MAX_PIXELS: Joi.number()
    .integer()
    .min(1_000_000)
    .max(40_000_000)
    .default(20_000_000),
  VERIFICATION_MEDIA_RETENTION_SECONDS: Joi.number()
    .integer()
    .min(900)
    .max(604_800)
    .default(86_400),
  VERIFICATION_MAX_ATTEMPTS: Joi.number().integer().min(1).max(10).default(3),
  VERIFICATION_ATTEMPT_WINDOW_HOURS: Joi.number()
    .integer()
    .min(1)
    .max(168)
    .default(24),
  VERIFICATION_RETRY_DELAY_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(86_400)
    .default(3_600),
  VERIFICATION_POLICY_VERSION: Joi.string()
    .pattern(/^[A-Za-z0-9._:-]{8,64}$/)
    .required(),
  VERIFICATION_CLEANUP_INTERVAL_MS: Joi.number()
    .integer()
    .min(10_000)
    .max(3_600_000)
    .default(300_000),
  VERIFICATION_CLEANUP_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),
  MUCYORA_ENGINE_URL: Joi.string().uri().required(),
  MUCYORA_ENGINE_SERVICE_KEY: Joi.string().min(32).max(512).required(),
  MUCYORA_ENGINE_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1_000)
    .max(90_000)
    .default(45_000),
  MUCYORA_ENGINE_MAX_CONCURRENCY: Joi.number()
    .integer()
    .min(1)
    .max(32)
    .default(4),
}).unknown(true);

export interface AuthEnvironment {
  APP_ENV: 'development' | 'test' | 'production';
  DATABASE_URL: string;
  LOG_LEVEL: 'error' | 'warn' | 'log' | 'debug' | 'verbose';
  CORS_ALLOWED_ORIGINS: string;
  ENABLE_SWAGGER: boolean;
  DOCS_BASIC_AUTH_USER: string;
  DOCS_BASIC_AUTH_PASS: string;
  READINESS_CACHE_TTL_MS: number;
  IDENTITY_ENCRYPTION_PROVIDER: 'SOFTWARE_GCM';
  IDENTITY_ENCRYPTION_KEY_VERSION: string;
  IDENTITY_ENCRYPTION_SECRET: string;
  IDENTITY_LOOKUP_KEY_VERSION: string;
  IDENTITY_LOOKUP_HMAC_KEY: string;
  TOKEN_DIGEST_HMAC_KEY: string;
  REQUEST_CONTEXT_HMAC_KEY: string;
  REDIS_URL: string;
  CACHE_PREFIX: string;
  CITIZEN_API_URL: string;
  CITIZEN_API_USERNAME: string;
  CITIZEN_API_PASSWORD: string;
  CITIZEN_API_FOSA_ID: string;
  CITIZEN_API_CONNECT_TIMEOUT_MS: number;
  CITIZEN_API_RESPONSE_TIMEOUT_MS: number;
  CITIZEN_API_MAX_RETRIES: number;
  CITIZEN_CACHE_TTL_SECONDS: number;
  CITIZEN_CIRCUIT_FAILURE_THRESHOLD: number;
  CITIZEN_CIRCUIT_RESET_TIMEOUT_MS: number;
  CITIZEN_LOOKUP_IP_LIMIT_PER_MINUTE: number;
  CITIZEN_LOOKUP_CLIENT_LIMIT_PER_MINUTE: number;
  CITIZEN_LOOKUP_NID_LIMIT_PER_MINUTE: number;
  REGISTRATION_CHALLENGE_TTL_SECONDS: number;
  REGISTRATION_CHALLENGE_MAX_ATTEMPTS: number;
  PASSWORD_ARGON2_MEMORY_KIB: number;
  PASSWORD_ARGON2_TIME_COST: number;
  PASSWORD_ARGON2_PARALLELISM: number;
  PASSWORD_HASH_MAX_CONCURRENCY: number;
  PASSWORD_RESET_TOKEN_TTL_SECONDS: number;
  PASSWORD_RESET_LIMIT_PER_HOUR: number;
  PASSWORD_CHANGE_LIMIT_PER_HOUR: number;
  EMAIL_TOKEN_TTL_SECONDS: number;
  REGISTRATION_LIMIT_PER_HOUR: number;
  EMAIL_RESEND_LIMIT_PER_HOUR: number;
  MAIL_OUTBOX_WORKER_ENABLED: boolean;
  MAIL_PROVIDER_URL: string;
  MAIL_FROM: string;
  MAIL_API_KEY: string;
  MUCYORA_USER_APP_URL: string;
  MAIL_PROVIDER_TIMEOUT_MS: number;
  OUTBOX_POLL_INTERVAL_MS: number;
  OUTBOX_BATCH_SIZE: number;
  MUCYORA_AUTH_ISSUER: string;
  MUCYORA_AUTH_ACCESS_AUDIENCES: string;
  MUCYORA_AUTH_SIGNING_KEY_ID: string;
  MUCYORA_AUTH_SIGNING_PRIVATE_KEY: string;
  MUCYORA_AUTH_SIGNING_PUBLIC_KEY: string;
  ACCESS_TOKEN_TTL_SECONDS: number;
  LIMITED_ACCESS_TOKEN_TTL_SECONDS: number;
  REFRESH_TOKEN_TTL_SECONDS: number;
  REFRESH_REPLAY_GRACE_SECONDS: number;
  LOGIN_LIMIT_PER_MINUTE: number;
  REFRESH_LIMIT_PER_MINUTE: number;
  LOGIN_LOCK_THRESHOLD: number;
  LOGIN_LOCK_SECONDS: number;
  COOKIE_DOMAIN: string;
  COOKIE_SECURE: boolean;
  COOKIE_SAME_SITE: 'lax' | 'strict' | 'none';
  REFRESH_COOKIE_NAME: string;
  CSRF_COOKIE_NAME: string;
  AWS_REGION: string;
  AWS_S3_VERIFICATION_BUCKET: string;
  AWS_S3_VERIFICATION_PREFIX: string;
  AWS_S3_ENDPOINT: string;
  AWS_S3_FORCE_PATH_STYLE: boolean;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_SESSION_TOKEN: string;
  VERIFICATION_UPLOAD_TTL_SECONDS: number;
  VERIFICATION_MEDIA_MAX_SIZE_BYTES: number;
  VERIFICATION_MEDIA_MAX_PIXELS: number;
  VERIFICATION_MEDIA_RETENTION_SECONDS: number;
  VERIFICATION_MAX_ATTEMPTS: number;
  VERIFICATION_ATTEMPT_WINDOW_HOURS: number;
  VERIFICATION_RETRY_DELAY_SECONDS: number;
  VERIFICATION_POLICY_VERSION: string;
  VERIFICATION_CLEANUP_INTERVAL_MS: number;
  VERIFICATION_CLEANUP_ENABLED: boolean;
  MUCYORA_ENGINE_URL: string;
  MUCYORA_ENGINE_SERVICE_KEY: string;
  MUCYORA_ENGINE_TIMEOUT_MS: number;
  MUCYORA_ENGINE_MAX_CONCURRENCY: number;
}

export function validateEnvironment(
  values: Record<string, unknown>,
): AuthEnvironment {
  const validation = environmentSchema.validate(values, {
    abortEarly: false,
    convert: true,
    stripUnknown: false,
  });

  if (validation.error) {
    throw new Error(
      `Auth environment validation failed: ${validation.error.details
        .map((detail) => detail.message)
        .join('; ')}`,
    );
  }

  const environment = validation.value as AuthEnvironment;
  const origins = parseAllowedOrigins(environment.CORS_ALLOWED_ORIGINS);

  if (origins.length === 0) {
    throw new Error(
      'Auth environment validation failed: CORS_ALLOWED_ORIGINS must contain at least one origin',
    );
  }

  if (
    environment.APP_ENV === 'production' &&
    environment.ENABLE_SWAGGER &&
    (!environment.DOCS_BASIC_AUTH_USER ||
      environment.DOCS_BASIC_AUTH_PASS.length < 16)
  ) {
    throw new Error(
      'Auth environment validation failed: protected production Swagger requires a username and a password of at least 16 characters',
    );
  }

  if (environment.APP_ENV === 'production') {
    assertRuntimeDatabaseRole(environment.DATABASE_URL);
  }

  assertEncodedKeys(environment);
  assertCitizenProviderUrl(environment);
  assertRedisUrl(environment);
  assertMailConfiguration(environment);
  assertAuthSigningConfiguration(environment);
  assertVerificationConfiguration(environment);

  return environment;
}

function assertVerificationConfiguration(environment: AuthEnvironment): void {
  const engineUrl = new URL(environment.MUCYORA_ENGINE_URL);
  const storageEndpoint = environment.AWS_S3_ENDPOINT
    ? new URL(environment.AWS_S3_ENDPOINT)
    : null;
  if (
    engineUrl.username ||
    engineUrl.password ||
    engineUrl.search ||
    engineUrl.hash ||
    (environment.APP_ENV === 'production' && engineUrl.protocol !== 'https:')
  ) {
    throw new Error(
      'Auth environment validation failed: MUCYORA_ENGINE_URL must be a fixed HTTPS origin in production',
    );
  }
  if (
    storageEndpoint &&
    (storageEndpoint.username ||
      storageEndpoint.password ||
      storageEndpoint.search ||
      storageEndpoint.hash ||
      (environment.APP_ENV === 'production' &&
        storageEndpoint.protocol !== 'https:'))
  ) {
    throw new Error(
      'Auth environment validation failed: AWS_S3_ENDPOINT must use HTTPS without embedded credentials in production',
    );
  }
  const separatedKeys = [
    environment.IDENTITY_ENCRYPTION_SECRET,
    environment.IDENTITY_LOOKUP_HMAC_KEY,
    environment.TOKEN_DIGEST_HMAC_KEY,
    environment.REQUEST_CONTEXT_HMAC_KEY,
  ];
  if (separatedKeys.includes(environment.MUCYORA_ENGINE_SERVICE_KEY)) {
    throw new Error(
      'Auth environment validation failed: MUCYORA_ENGINE_SERVICE_KEY must differ from all other security keys',
    );
  }
}

function assertAuthSigningConfiguration(environment: AuthEnvironment): void {
  try {
    const privateKey = createPrivateKey(
      environment.MUCYORA_AUTH_SIGNING_PRIVATE_KEY,
    );
    const publicKey = createPublicKey(
      environment.MUCYORA_AUTH_SIGNING_PUBLIC_KEY,
    );
    if (
      privateKey.asymmetricKeyType !== 'rsa' ||
      publicKey.asymmetricKeyType !== 'rsa'
    ) {
      throw new Error('RSA keys required');
    }
    const probe = Buffer.from('mucyora-auth-signing-key-pair-check');
    if (
      !verify(
        'RSA-SHA256',
        probe,
        publicKey,
        sign('RSA-SHA256', probe, privateKey),
      )
    ) {
      throw new Error('Signing key pair does not match');
    }
    if (
      environment.MUCYORA_AUTH_ACCESS_AUDIENCES.split(',')
        .map((value) => value.trim())
        .filter(Boolean).length === 0
    ) {
      throw new Error('Audience required');
    }
  } catch {
    throw new Error(
      'Auth environment validation failed: Auth signing keys must be valid RSA PEM keys',
    );
  }

  if (environment.COOKIE_SAME_SITE === 'none' && !environment.COOKIE_SECURE) {
    throw new Error(
      'Auth environment validation failed: COOKIE_SAME_SITE=none requires COOKIE_SECURE=true',
    );
  }

  if (environment.APP_ENV === 'production' && !environment.COOKIE_SECURE) {
    throw new Error(
      'Auth environment validation failed: production authentication cookies must be secure',
    );
  }
}

function assertMailConfiguration(environment: AuthEnvironment): void {
  const applicationUrl = new URL(environment.MUCYORA_USER_APP_URL);
  if (
    !['https:', 'http:'].includes(applicationUrl.protocol) ||
    applicationUrl.username ||
    applicationUrl.password ||
    applicationUrl.search ||
    applicationUrl.hash ||
    (environment.APP_ENV === 'production' &&
      applicationUrl.protocol !== 'https:')
  ) {
    throw new Error(
      'Auth environment validation failed: MUCYORA_USER_APP_URL must be a fixed HTTPS origin in production',
    );
  }

  if (!environment.MAIL_OUTBOX_WORKER_ENABLED) {
    return;
  }

  if (
    !environment.MAIL_PROVIDER_URL ||
    !environment.MAIL_FROM ||
    environment.MAIL_API_KEY.length < 16
  ) {
    throw new Error(
      'Auth environment validation failed: enabled mail worker requires MAIL_PROVIDER_URL, MAIL_FROM, and a MAIL_API_KEY of at least 16 characters',
    );
  }

  const providerUrl = new URL(environment.MAIL_PROVIDER_URL);
  if (
    providerUrl.username ||
    providerUrl.password ||
    providerUrl.search ||
    providerUrl.hash ||
    !['https:', 'http:'].includes(providerUrl.protocol)
  ) {
    throw new Error(
      'Auth environment validation failed: MAIL_PROVIDER_URL must be a fixed HTTP(S) URL without credentials, query, or fragment',
    );
  }

  if (
    environment.APP_ENV === 'production' &&
    providerUrl.protocol !== 'https:'
  ) {
    throw new Error(
      'Auth environment validation failed: production MAIL_PROVIDER_URL must use HTTPS',
    );
  }

  if (
    providerUrl.protocol === 'http:' &&
    !['localhost', '127.0.0.1', '::1'].includes(providerUrl.hostname)
  ) {
    throw new Error(
      'Auth environment validation failed: insecure MAIL_PROVIDER_URL is allowed only for a local test provider',
    );
  }
}

function assertCitizenProviderUrl(environment: AuthEnvironment): void {
  const url = new URL(environment.CITIZEN_API_URL);

  if (
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    !['https:', 'http:'].includes(url.protocol)
  ) {
    throw new Error(
      'Auth environment validation failed: CITIZEN_API_URL must be a fixed HTTP(S) URL without credentials, query, or fragment',
    );
  }

  if (environment.APP_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error(
      'Auth environment validation failed: production CITIZEN_API_URL must use HTTPS',
    );
  }

  if (
    url.protocol === 'http:' &&
    !['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  ) {
    throw new Error(
      'Auth environment validation failed: insecure CITIZEN_API_URL is allowed only for a local test provider',
    );
  }
}

function assertRedisUrl(environment: AuthEnvironment): void {
  const url = new URL(environment.REDIS_URL);
  if (url.hash || url.search) {
    throw new Error(
      'Auth environment validation failed: REDIS_URL must not contain query or fragment data',
    );
  }

  if (environment.APP_ENV === 'production' && url.protocol !== 'rediss:') {
    throw new Error(
      'Auth environment validation failed: production REDIS_URL must use TLS',
    );
  }
}

export function parseAllowedOrigins(value: string): string[] {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  for (const origin of origins) {
    if (origin === '*' || !isHttpOrigin(origin)) {
      throw new Error(
        `Auth environment validation failed: invalid CORS origin "${origin}"`,
      );
    }
  }

  return [...new Set(origins)];
}

function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === value
    );
  } catch {
    return false;
  }
}

function assertRuntimeDatabaseRole(databaseUrl: string): void {
  const username = decodeURIComponent(new URL(databaseUrl).username);

  if (username !== 'mucyora_auth_app') {
    throw new Error(
      'Auth environment validation failed: production DATABASE_URL must use the mucyora_auth_app runtime role',
    );
  }
}

function assertEncodedKeys(environment: AuthEnvironment): void {
  const keys = [
    ['IDENTITY_ENCRYPTION_SECRET', environment.IDENTITY_ENCRYPTION_SECRET],
    ['IDENTITY_LOOKUP_HMAC_KEY', environment.IDENTITY_LOOKUP_HMAC_KEY],
    ['TOKEN_DIGEST_HMAC_KEY', environment.TOKEN_DIGEST_HMAC_KEY],
    ['REQUEST_CONTEXT_HMAC_KEY', environment.REQUEST_CONTEXT_HMAC_KEY],
  ] as const;
  const decoded = keys.map(([name, value]) => {
    if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) {
      throw new Error(
        `Auth environment validation failed: ${name} must be base64url encoded`,
      );
    }

    const key = Buffer.from(value, 'base64url');
    if (key.length < 32) {
      throw new Error(
        `Auth environment validation failed: ${name} must decode to at least 32 bytes`,
      );
    }
    return { name, key };
  });

  for (let left = 0; left < decoded.length; left += 1) {
    for (let right = left + 1; right < decoded.length; right += 1) {
      if (decoded[left].key.equals(decoded[right].key)) {
        throw new Error(
          `Auth environment validation failed: ${decoded[left].name} and ${decoded[right].name} must differ`,
        );
      }
    }
  }
}
