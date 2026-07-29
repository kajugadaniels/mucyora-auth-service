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

This repository is an early scaffold. The application currently exposes the
Nest starter `GET /` endpoint. Domain module boundaries exist for:

- authentication;
- registration;
- identity verification;
- sessions;
- password management;
- OTP;
- health checks;
- shared infrastructure.

Those modules do not yet contain controllers or business logic. Treat the list
as intended ownership, not as a claim that the APIs are implemented.

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

## Setup

```bash
cp .env.example .env
npm install
npm run build
npm run start:dev
```

The shared Prisma client must already be generated and built in `api/db`.

## Commands

| Command | Purpose |
|---|---|
| `npm run start:dev` | Run in watch mode on port 3000 |
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

- Hash passwords with an approved adaptive password hash.
- Store reset, verification, refresh, and OTP tokens as hashes.
- Keep access and refresh token lifetimes explicit and bounded.
- Rate-limit registration, login, OTP, recovery, and verification endpoints.
- Never log passwords, raw tokens, plaintext government identifiers, biometric
  media, or connection strings.
- Keep calls to `api/engine` authenticated and internal.

## Documentation

Start with [`docs/INDEX.md`](docs/INDEX.md). It covers architecture,
configuration, database ownership, security, development, testing, and
documentation rules.

## Production Readiness

Before production, replace the starter endpoint with explicit health/readiness
routes and implement global validation, safe exception handling, Helmet, strict
CORS, rate limiting, structured logging, secret management, and complete
authentication tests.
