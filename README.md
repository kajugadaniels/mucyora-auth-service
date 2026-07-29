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

Phase 10 of the implementation plan is complete. In addition to the secure
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
- a private typed NIDA citizen-identity provider;
- fixed-target authenticated HTTP with TLS validation and keep-alive;
- response validation, minimization, and safe provider errors;
- bounded timeouts, retries, backoff, and circuit breaking;
- encrypted Redis positive caching with HMAC-derived keys;
- duplicate in-flight lookup suppression and privacy-safe metrics.
- a protected citizen registration-initiation endpoint;
- Redis-backed IP, client-instance, and NID-HMAC rate limits;
- encrypted, expiring, attempt-bounded registration challenges;
- atomic single-use challenge lifecycle operations;
- generic anti-enumeration errors and challenge audit events.
- atomic NIDA-backed account registration;
- Argon2id password hashing with bounded concurrency and a password blocklist;
- encrypted identity creation and four versioned consent records;
- digest-only, single-use email verification tokens;
- generic, distributed-rate-limited email resend;
- encrypted-token outbox events and asynchronous mail dispatch.
- generic Argon2id login with distributed abuse limits;
- limited and full database-backed sessions;
- minimized RS256 access tokens and cacheable public JWKS;
- digest-only opaque refresh tokens with atomic generation rotation;
- distributed refresh coordination and family reuse detection;
- secure cookie/CSRF and explicit native compatibility transports;
- logout, logout-all, bounded session listing, and owned revocation.
- generic, distributed-rate-limited password recovery;
- indexed digest-only, expiring, atomically single-use reset tokens;
- current-password-protected password change;
- password-change session and refresh-token revocation;
- asynchronous reset and password-change security notifications.
- consent- and attempt-gated NIDA-linked identity verification;
- private, direct, attempt-bound verification-media upload policies;
- provider-backed AWS Face Liveness sessions;
- signed and replay-resistant MUCYORA Engine requests;
- normalized pass, fail, retry, review, and provider-unavailable states;
- bounded attempt windows, retry deadlines, and media reconciliation.
- atomic, idempotent limited-to-full session replacement;
- verification-attempt ownership and enrollment-purpose enforcement;
- limited-family refresh revocation before full credential issuance;
- cookie and native upgrade transports with encrypted replay results.
- fresh `DEVICE_TRANSFER`, `AGREEMENT_SIGNING`, and `ACCOUNT_RECOVERY` proof;
- HMAC target-bound, purpose-specific step-up challenges;
- short-lived, encrypted, one-time internal assertions;
- dedicated service authentication for User, Signature, and Auth Recovery.

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

| Method   | Path                                                                 | Purpose                                              |
| -------- | -------------------------------------------------------------------- | ---------------------------------------------------- |
| `GET`    | `/health/live`                                                       | Process liveness without database or external calls  |
| `GET`    | `/health/ready`                                                      | Cached database readiness                            |
| `POST`   | `/api/v1/registration/citizen/lookup`                                | Create an opaque, short-lived registration challenge |
| `POST`   | `/api/v1/registration`                                               | Atomically create a pending account                  |
| `POST`   | `/api/v1/registration/email/verify`                                  | Consume an email-verification token                  |
| `POST`   | `/api/v1/registration/email/resend`                                  | Request a generic verification resend                |
| `POST`   | `/api/v1/auth/login`                                                 | Create a limited or full session                     |
| `POST`   | `/api/v1/auth/refresh`                                               | Atomically rotate refresh credentials                |
| `POST`   | `/api/v1/auth/session/upgrade`                                       | Replace a verified limited session with a full one   |
| `POST`   | `/api/v1/auth/logout`                                                | Revoke the current session                           |
| `POST`   | `/api/v1/auth/logout-all`                                            | Revoke all owned sessions                            |
| `GET`    | `/api/v1/auth/sessions`                                              | List active owned sessions                           |
| `DELETE` | `/api/v1/auth/sessions/:sessionId`                                   | Revoke one owned session                             |
| `POST`   | `/api/v1/auth/password/forgot`                                       | Request generic password recovery                    |
| `POST`   | `/api/v1/auth/password/reset`                                        | Consume a single-use password reset                  |
| `POST`   | `/api/v1/auth/password/change`                                       | Change a password using current credentials          |
| `POST`   | `/api/v1/identity-verification/attempts`                             | Create an enrollment attempt                         |
| `POST`   | `/api/v1/identity-verification/attempts/:attemptId/upload-policy`    | Create private upload policy                         |
| `POST`   | `/api/v1/identity-verification/attempts/:attemptId/media/confirm`    | Confirm private media                                |
| `POST`   | `/api/v1/identity-verification/attempts/:attemptId/liveness-session` | Create real liveness session                         |
| `POST`   | `/api/v1/identity-verification/attempts/:attemptId/submit`           | Submit verification                                  |
| `GET`    | `/api/v1/identity-verification/status`                               | Read identity status                                 |
| `GET`    | `/api/v1/identity-verification/attempts/:attemptId`                  | Read owned attempt                                   |
| `POST`   | `/api/v1/step-up/challenges`                                         | Create a target-bound fresh-verification challenge   |
| `GET`    | `/api/v1/step-up/challenges/:challengeId`                            | Read an owned step-up challenge                      |
| `POST`   | `/api/v1/step-up/challenges/:challengeId/assertion`                  | Issue an assertion after the linked attempt passes   |
| `POST`   | `/api/v1/internal/step-up/assertions/consume`                        | Atomically consume an authorized internal assertion  |
| `GET`    | `/.well-known/jwks.json`                                             | Return public access-token verification keys         |

Later application APIs will be mounted below `/api/v1` in their separately
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

| Command                  | Purpose                                            |
| ------------------------ | -------------------------------------------------- |
| `npm run start:dev`      | Run in watch mode on port 3000                     |
| `npm run check`          | Run boundary, lint, build, unit, and e2e checks    |
| `npm run check:boundary` | Reject forbidden Prisma and cross-domain ownership |
| `npm run build`          | Compile the service                                |
| `npm run start:prod`     | Run compiled output                                |
| `npm run test`           | Run unit tests                                     |
| `npm run test:e2e`       | Run end-to-end tests                               |
| `npm run test:cov`       | Run tests with coverage                            |
| `npm run lint`           | Check and fix lint findings                        |
| `npm run format`         | Format TypeScript files                            |

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
- Require HTTPS for the production citizen provider and `rediss://` for
  production Redis.
- Never expose or persist a raw provider response; cache only the minimized,
  encrypted positive result.

Session-upgrade idempotency records expire after a short configurable window;
their credential result is encrypted with purpose-bound AES-GCM.

Step-up assertions are purpose- and target-bound, have a maximum five-minute
default lifetime, and are consumed through a conditional single-row update.
Internal services use separate purpose-specific service credentials.

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

The service is not yet a production-ready authentication product. Later phases
must still implement operational jobs, load testing, and release security
gates.
