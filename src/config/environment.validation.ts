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

  return environment;
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
