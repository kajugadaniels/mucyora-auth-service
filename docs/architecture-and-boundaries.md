# Architecture and Boundaries

## Role

`api/auth` is the user identity and access authority. It is intended to own
registration, login, credentials, user sessions, password recovery, OTP, and
identity-verification orchestration.

## Current Implementation

The repository currently contains module shells and a starter root endpoint.
New documentation and API contracts must not describe module shells as complete
features.

## Dependencies

```text
Client
  -> api/auth
       -> @mucyora/db
       -> api/engine (internal identity-verification computation)
```

`api/engine` returns verification results but never owns user state. `api/auth`
validates the request, controls attempts and authorization, and persists the
result.

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
