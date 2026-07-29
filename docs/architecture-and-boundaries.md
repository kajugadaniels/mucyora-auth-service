# Architecture and Boundaries

## Role

`api/auth` is the user identity and access authority. It is intended to own
registration, login, credentials, user sessions, password recovery, OTP, and
identity-verification orchestration.

## Current Implementation

The repository contains a production-oriented HTTP and database foundation,
security primitives, a private resilient NIDA adapter, citizen registration,
email verification, and asynchronous mail dispatch. It exposes liveness,
readiness, Phase 4–5 registration, and Phase 6 authentication/session
endpoints. Password recovery and biometric identity-verification endpoints
remain unimplemented.

## Dependencies

```text
Client
  -> api/auth
       -> @mucyora/db
       -> NIDA provider (private adapter)
       -> Redis (encrypted positive provider cache)
       -> api/engine (internal identity-verification computation)
```

`api/engine` returns verification results but never owns user state. `api/auth`
validates the request, controls attempts and authorization, and persists the
result.

## Runtime Flow

```text
HTTP request
  -> bounded body parser and Helmet
  -> exact-origin CORS
  -> correlation ID middleware
  -> global DTO validation
  -> controller
  -> domain service
  -> @mucyora/db or a typed integration adapter
  -> safe exception response and structured log
```

Health liveness stops before all dependencies. Readiness performs only a cached
database check in Phase 1.

The citizen adapter is consumed through `CitizenIdentityProvider`; domain code
does not depend on Axios or provider response shapes. Phase 4 adds a
Redis-rate-limited public endpoint and persists only the encrypted minimized
challenge state in the existing database contract.

## Ownership Rules

- User access tokens are issued here.
- Administrator access tokens are issued only by `api/admin`.
- Prisma schema and migrations belong only to `api/db`.
- Cryptographic signing keys belong only to `api/signature`.
- User-facing device and ownership workflows belong to `api/user`.

## Module Rules

Keep controllers transport-focused, services responsible for workflows, DTOs
explicit, and provider integrations behind typed adapters. Shared primitives
belong in `src/common`; domain logic belongs in the owning module.
