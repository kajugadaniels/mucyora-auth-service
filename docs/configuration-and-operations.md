# Configuration and Operations

## Fixed Port

The service listens on port `3000`. This is a code-level service contract and
must not be made environment-dependent without a coordinated platform change.

## Current Environment

```env
APP_ENV=development
LOG_LEVEL=debug
DATABASE_URL=postgresql://mucyora_auth_app:replace-me@localhost:5432/mucyora?sslmode=require&connection_limit=10&pool_timeout=10
CORS_ALLOWED_ORIGINS=http://localhost:4000
READINESS_CACHE_TTL_MS=5000
ENABLE_SWAGGER=false
DOCS_BASIC_AUTH_USER=
DOCS_BASIC_AUTH_PASS=
IDENTITY_ENCRYPTION_PROVIDER=SOFTWARE_GCM
IDENTITY_ENCRYPTION_KEY_VERSION=v1
IDENTITY_ENCRYPTION_SECRET=
IDENTITY_LOOKUP_KEY_VERSION=v1
IDENTITY_LOOKUP_HMAC_KEY=
TOKEN_DIGEST_HMAC_KEY=
REQUEST_CONTEXT_HMAC_KEY=
REDIS_URL=redis://localhost:6379
CACHE_PREFIX=mucyora:auth:
CITIZEN_API_URL=http://127.0.0.1:3100/citizens/lookup
CITIZEN_API_USERNAME=
CITIZEN_API_PASSWORD=
CITIZEN_API_FOSA_ID=0022
CITIZEN_API_CONNECT_TIMEOUT_MS=3000
CITIZEN_API_RESPONSE_TIMEOUT_MS=10000
CITIZEN_API_MAX_RETRIES=2
CITIZEN_CACHE_TTL_SECONDS=300
CITIZEN_CIRCUIT_FAILURE_THRESHOLD=5
CITIZEN_CIRCUIT_RESET_TIMEOUT_MS=30000
CITIZEN_LOOKUP_IP_LIMIT_PER_MINUTE=5
CITIZEN_LOOKUP_CLIENT_LIMIT_PER_MINUTE=5
CITIZEN_LOOKUP_NID_LIMIT_PER_MINUTE=3
REGISTRATION_CHALLENGE_TTL_SECONDS=600
REGISTRATION_CHALLENGE_MAX_ATTEMPTS=3
PASSWORD_ARGON2_MEMORY_KIB=65536
PASSWORD_ARGON2_TIME_COST=3
PASSWORD_ARGON2_PARALLELISM=1
PASSWORD_HASH_MAX_CONCURRENCY=4
PASSWORD_RESET_TOKEN_TTL_SECONDS=900
PASSWORD_RESET_LIMIT_PER_HOUR=3
PASSWORD_CHANGE_LIMIT_PER_HOUR=5
EMAIL_TOKEN_TTL_SECONDS=86400
REGISTRATION_LIMIT_PER_HOUR=3
EMAIL_RESEND_LIMIT_PER_HOUR=3
MAIL_OUTBOX_WORKER_ENABLED=false
MAIL_PROVIDER_URL=
MAIL_FROM=
MAIL_API_KEY=
MUCYORA_USER_APP_URL=http://localhost:4000
MAIL_PROVIDER_TIMEOUT_MS=5000
OUTBOX_POLL_INTERVAL_MS=5000
OUTBOX_BATCH_SIZE=20
MUCYORA_AUTH_ISSUER=http://localhost:3000
MUCYORA_AUTH_ACCESS_AUDIENCES=mucyora-user,mucyora-signature
MUCYORA_AUTH_SIGNING_KEY_ID=
MUCYORA_AUTH_SIGNING_PRIVATE_KEY=
MUCYORA_AUTH_SIGNING_PUBLIC_KEY=
ACCESS_TOKEN_TTL_SECONDS=900
LIMITED_ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_SECONDS=2592000
REFRESH_REPLAY_GRACE_SECONDS=10
SESSION_UPGRADE_IDEMPOTENCY_TTL_SECONDS=900
LOGIN_LIMIT_PER_MINUTE=5
REFRESH_LIMIT_PER_MINUTE=10
LOGIN_LOCK_THRESHOLD=10
LOGIN_LOCK_SECONDS=900
COOKIE_DOMAIN=
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
REFRESH_COOKIE_NAME=mucyora_refresh
CSRF_COOKIE_NAME=mucyora_csrf
AWS_REGION=eu-west-1
AWS_S3_VERIFICATION_BUCKET=
AWS_S3_VERIFICATION_PREFIX=identity-verification/
AWS_S3_ENDPOINT=
AWS_S3_FORCE_PATH_STYLE=false
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_SESSION_TOKEN=
VERIFICATION_UPLOAD_TTL_SECONDS=300
VERIFICATION_MEDIA_MAX_SIZE_BYTES=5242880
VERIFICATION_MEDIA_MAX_PIXELS=20000000
VERIFICATION_MEDIA_RETENTION_SECONDS=86400
VERIFICATION_MAX_ATTEMPTS=3
VERIFICATION_ATTEMPT_WINDOW_HOURS=24
VERIFICATION_RETRY_DELAY_SECONDS=3600
VERIFICATION_POLICY_VERSION=2026-07-01
VERIFICATION_CLEANUP_ENABLED=false
VERIFICATION_CLEANUP_INTERVAL_MS=300000
MUCYORA_ENGINE_URL=http://localhost:8000
MUCYORA_ENGINE_SERVICE_KEY=
MUCYORA_ENGINE_TIMEOUT_MS=45000
MUCYORA_ENGINE_MAX_CONCURRENCY=4
STEP_UP_POLICY_VERSION=step-up-2026-07
STEP_UP_CHALLENGE_TTL_SECONDS=600
STEP_UP_ASSERTION_TTL_SECONDS=300
MUCYORA_USER_SERVICE_KEY=
MUCYORA_SIGNATURE_SERVICE_KEY=
MUCYORA_AUTH_RECOVERY_SERVICE_KEY=
```

Future variables must be added to `.env.example` in the same change that adds
their runtime validation.

## Validation Rules

- `APP_ENV` is `development`, `test`, or `production`.
- `DATABASE_URL` is a PostgreSQL URL.
- Production database usernames must equal `mucyora_auth_app`.
- `CORS_ALLOWED_ORIGINS` contains comma-separated exact HTTP(S) origins.
- Wildcard, path-bearing, and malformed origins are rejected.
- Production Swagger requires a username and a documentation password of at
  least 16 characters.
- Readiness cache TTL is bounded between 250 ms and 30 seconds.
- Security keys are base64url-encoded and decode to at least 32 bytes.
- The AES-256-GCM encryption key decodes to exactly 32 bytes.
- Encryption, identity lookup, token digest, and request-context keys must be
  different.
- Production Redis URLs use `rediss://`; query and fragment data are rejected.
- The citizen-provider URL cannot contain credentials, a query, or a fragment.
- Production citizen-provider traffic requires HTTPS. Plain HTTP is accepted
  only for a provider bound to localhost in development or tests.
- Citizen-provider timeouts, retry count, cache TTL, circuit threshold, and
  reset interval are bounded at startup.
- Citizen lookup limits are positive integers bounded to 100 per minute.
- Registration challenges expire within 2–15 minutes and allow 1–10 attempts.
- Argon2id memory, time, parallelism, and concurrent hashing are bounded.
- Email verification lifetime is bounded between 15 minutes and 48 hours.
- Registration and resend hourly limits are bounded to 1–20.
- Enabling the mail worker requires a fixed provider URL, sender address, and
  an API key of at least 16 characters. Production mail requires HTTPS.
- Signing keys must be a matching RSA PEM pair and have a stable key ID.
- Access, limited-access, refresh, replay-grace, session-upgrade idempotency,
  login, refresh, and lock settings are bounded at startup.
- Production requires secure authentication cookies.
- Step-up challenge and assertion lifetimes are bounded to 5–30 minutes and
  1–10 minutes respectively.
- User, Signature, Auth Recovery, and Engine service keys must be distinct from
  every cryptographic key and from each other.

The port is deliberately absent because the service always uses port `3000`.

## Health and Shutdown

`GET /health/live` checks only that the application process can respond. It
must never contact PostgreSQL or future external dependencies.

`GET /health/ready` checks PostgreSQL and caches the result for
`READINESS_CACHE_TTL_MS`. Use readiness for traffic admission and liveness for
process restart decisions.

Nest shutdown hooks disconnect the shared Prisma client during controlled
termination.

## API Documentation

Swagger is disabled by default. Set `ENABLE_SWAGGER=true` only in an approved
environment. When enabled, documentation is served at `/api/docs`. Production
also requires `DOCS_BASIC_AUTH_USER` and `DOCS_BASIC_AUTH_PASS`.

Documentation Basic authentication is an additional access layer, not a
replacement for private network controls.

## Connection Pool

Pool values are supplied through reviewed PostgreSQL URL parameters supported
by `@mucyora/db` and its adapter. Start with conservative limits, account for
the number of replicas, and keep total application connections below the Neon
or PostgreSQL quota. Tune with measured load rather than copying the example.

## Required Production Controls

- validate all configuration at startup;
- reject placeholder or weak secrets;
- use platform-managed secrets;
- expose separate liveness and readiness endpoints;
- fail readiness when required dependencies are unavailable;
- emit structured logs without sensitive payloads;
- shut down gracefully and close database connections.

## Commands

```bash
npm install
npm run build
npm run check:boundary
npm run lint:check
npm run test
npm run test:e2e
npm run start:dev
```

`DATABASE_MIGRATION_URL` is forbidden in this service.

## Citizen Provider Operations

The Phase 3 citizen adapter is private and creates no public route. Redis is a
performance dependency for encrypted positive caching; a cache outage falls
back to the provider. Provider availability is controlled with response
timeouts, bounded retries, and a circuit breaker.

Use a dedicated least-privilege Redis credential and provider credential in
production. Rotate either through the deployment secret platform. Never place
credentials in `CITIZEN_API_URL`, logs, documentation, or support messages.

See [Citizen provider integration](citizen-provider-integration.md) for the
request, caching, failure, and testing contracts.

The public Phase 4 route uses Redis as a mandatory distributed abuse-control
dependency and fails closed when rate-limit state is unavailable. See
[Citizen lookup and registration challenges](registration-challenges.md).

The mail worker is disabled by default. Enable it only after configuring the
approved provider and Redis. It polls bounded unpublished batches and records
safe failure codes. See
[Registration and email verification](registration-and-email-verification.md).

Signing private keys belong only in Auth secret management. Consumers use the
cacheable public JWKS and must validate issuer, audience, algorithm, key ID,
expiry, and session-level authorization. See
[Authentication and sessions](authentication-and-sessions.md).

## Security Benchmark

Run the synthetic local microbenchmark:

```bash
npm run benchmark:security
```

It measures versioned HMAC lookup and AES-256-GCM encrypt/decrypt operations.
It does not access the database, NIDA, production keys, or real identifiers.
