# Architecture and Boundaries

## Role

`api/auth` is the user identity and access authority. It is intended to own
registration, login, credentials, user sessions, password recovery, OTP, and
identity-verification orchestration.

## Current Implementation

The repository contains a production-oriented HTTP and database foundation,
security primitives, a private resilient NIDA adapter, and domain module
shells. It exposes liveness and readiness endpoints. It does not yet expose
registration, citizen lookup, login, token, password, or identity-verification
application endpoints.

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
must not depend on Axios, Redis, or provider response shapes. Phase 3 adds no
public endpoint and no database mutation.

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
