# MUCYORA Authentication Service

Identity and access boundary for the MUCYORA platform.

> Repository: `api/auth`  
> Runtime: Node.js 22, NestJS 11, TypeScript  
> Fixed port: `3000`  
> Database package: `@mucyora/db`

## Purpose

The Authentication Service is the intended owner of user registration,
credential verification, sessions, password recovery, OTP workflows, and
identity-verification orchestration. It is the only service that should issue
user access tokens.

## Current Status

Phase 2 of the implementation plan is complete. In addition to the secure
service foundation, Auth now provides:

- strict startup environment validation;
- exact-origin credentialed CORS;
- Helmet and bounded request bodies;
- global DTO validation and safe exception responses;
- correlation IDs and structured JSON logging;
- shared database lifecycle management through `@mucyora/db`;
- separate dependency-free liveness and database readiness routes;
- disabled-by-default API documentation;
- graceful shutdown, boundary checks, container packaging, and CI checks.
- versioned identity lookup HMACs and AES-256-GCM envelopes;
- email/NID normalization and identifier masking;
- cryptographically random opaque tokens and keyed digests;
- bounded idempotency support;
- minimized durable authentication security events;
- a generated shared database contract for future Auth workflows.

Authentication, registration, NIDA, password, session, and identity-verification
business functionality is not implemented yet. Existing domain modules remain
ownership shells.

## Service Boundary

This service may:

- authenticate users and issue user tokens;
- coordinate identity verification with `api/engine`;
- persist auth, token, identity, and verification records through
  `@mucyora/db`;
- emit security events for authentication-sensitive actions.

It must not:

- own Prisma migrations;
- issue administrator tokens;
- implement device, ownership, payment, or agreement workflows;
- perform cryptographic document signing;
- expose biometric media or database credentials.

## Port Contract

The service always listens on:

```text
http://localhost:3000
```

The port is intentionally fixed in `src/main.ts` and is not overridden by
environment variables.

## Implemented Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health/live` | Process liveness without database or external calls |
| `GET` | `/health/ready` | Cached database readiness |

Application APIs will be mounted below `/api/v1` in their separately
authorized phases.

## Setup

```bash
cp .env.example .env
npm install
npm run check:boundary
npm run build
npm run start:dev
```

The shared Prisma client must already be generated and built in `api/db`.

## Commands

| Command | Purpose |
|---|---|
| `npm run start:dev` | Run in watch mode on port 3000 |
| `npm run check` | Run boundary, lint, build, unit, and e2e checks |
| `npm run check:boundary` | Reject forbidden Prisma and cross-domain ownership |
| `npm run build` | Compile the service |
| `npm run start:prod` | Run compiled output |
| `npm run test` | Run unit tests |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run test:cov` | Run tests with coverage |
| `npm run lint` | Check and fix lint findings |
| `npm run format` | Format TypeScript files |

## Database Rules

- Use only the least-privilege `mucyora_auth_app` runtime role.
- Import Prisma client and generated types from `@mucyora/db`.
- Do not install or invoke Prisma migration tooling here.
- Do not use `DATABASE_MIGRATION_URL`.
- Schema changes belong in `api/db`.

## Security Baseline

- Keep `ENABLE_SWAGGER=false` unless documentation is explicitly required.
- Use a production documentation password of at least 16 characters when
  Swagger is enabled.
- Configure only exact origins in `CORS_ALLOWED_ORIGINS`; wildcards are
  rejected.
- Never log passwords, raw tokens, plaintext government identifiers, biometric
  media, or connection strings.
- Use only `mucyora_auth_app` in the production `DATABASE_URL`.
- Keep future calls to `api/engine` authenticated and internal.

Credential hashing, token storage, rate limiting, and identity encryption are
requirements for later phases and are not claimed as implemented.

## Container Build

The image needs both sibling projects because Auth consumes the local
`@mucyora/db` package. From the `api` directory, run:

```bash
docker build -f auth/Dockerfile -t mucyora-auth .
```

The final image runs as a non-root user and uses `/health/live` for its
container health check.

## Documentation

Start with [`docs/INDEX.md`](docs/INDEX.md). It covers architecture,
configuration, database ownership, security, development, testing, and
documentation rules.

## Production Readiness

The foundation is not a production-ready authentication product by itself.
Later phases must still implement and validate cryptography, distributed rate
limiting, NIDA resilience, registration, sessions, recovery, verification,
outbox processing, load testing, and release security gates.
