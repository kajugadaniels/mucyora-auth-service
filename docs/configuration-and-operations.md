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
