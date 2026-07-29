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

  return environment;
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
