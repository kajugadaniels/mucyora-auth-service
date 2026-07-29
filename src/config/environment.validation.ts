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
