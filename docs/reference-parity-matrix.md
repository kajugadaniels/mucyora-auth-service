# Reference Parity Matrix

## Purpose

This document maps the behavior of the prior MUCYORA authentication reference
at revision `a2affdc` to the current service boundaries and implementation
phases. The reference is behavioral input, not code to copy. MUCYORA keeps
useful workflows while replacing legacy ownership, cryptography, persistence,
and horizontal-scaling assumptions.

## Reference Inventory

The reference contains these principal modules and integrations:

- `auth`: login, refresh, logout, password recovery, and JWT validation;
- `citizen`: NIDA lookup through a provider HTTP API;
- `users`: registration, email verification, profile, preferences, activity,
  image upload, and password change;
- `verification`: identity-media submission, attempt control, Engine calls,
  status, and account verification state;
- `foreign-identity`: FIN lookup and foreign-user registration support;
- shared Prisma, encryption, S3, mail, security-event, scheduling, filtering,
  throttling, and documentation infrastructure.

Reference DTOs cover citizen lookup, registration, login, refresh, email
verification, password recovery/change, profile/preferences/activity, and
verification submission. Its tests concentrate on FIN registration,
verification restrictions, user preferences, seed generation, and selected
verification behavior. It does not provide the complete security,
concurrency, contract, and failure-mode matrix required by the MUCYORA plan.

## Capability Mapping

| Reference capability             | MUCYORA decision    | Owner                     |         Phase | Notes                                                                                                    |
| -------------------------------- | ------------------- | ------------------------- | ------------: | -------------------------------------------------------------------------------------------------------- |
| NIDA citizen lookup              | Retain and redesign | `api/auth`                |           3–4 | Typed adapter, response minimization, HMAC cache keys, distributed cache, bounded retry, circuit breaker |
| NIDA registration                | Retain and redesign | `api/auth`                |           4–5 | Registration challenge separates provider lookup from atomic account creation                            |
| FIN registration                 | Remove              | None in initial release   |             — | Foreign identity is explicitly out of scope                                                              |
| Email/password registration      | Retain and harden   | `api/auth`                |             5 | Argon2id, normalized email, consent, outbox, idempotency                                                 |
| Atomic multi-record registration | Retain              | `api/auth` using `api/db` |             5 | No provider or mail call inside the transaction                                                          |
| Email verification/resend        | Retain and harden   | `api/auth`                |             5 | Digest-only tokens, supersession, generic responses                                                      |
| Login                            | Retain and harden   | `api/auth`                |             6 | Generic errors, dummy verification, account gates                                                        |
| Limited/full access tokens       | Retain and harden   | `api/auth`                |          6, 9 | Asymmetric signing, minimized claims, explicit session level                                             |
| Refresh rotation                 | Retain and redesign | `api/auth`                |             6 | Atomic generations, family state, replay detection                                                       |
| Logout and session revocation    | Retain and expand   | `api/auth`                |             6 | Individual, current, and all-session controls                                                            |
| Password recovery                | Retain and harden   | `api/auth`                |             7 | Single-use digest, outbox email, session revocation policy                                               |
| Password change                  | Retain              | `api/auth`                |             7 | Current password or step-up required                                                                     |
| ID/selfie verification workflow  | Retain and redesign | `api/auth` + `api/engine` |             8 | Auth owns state/media lifecycle; Engine owns biometric computation                                       |
| Still-image liveness heuristic   | Remove              | —                         |             — | Must be replaced by provider-backed liveness evidence                                                    |
| Verification attempt lockout     | Retain and redesign | `api/auth`                |             8 | Policy-versioned, configurable, risk-aware, with `retryAfter`                                            |
| S3 verification media            | Retain and harden   | `api/auth`                |         8, 11 | Private, attempt-bound, streamed/direct upload, checksums, expiry and deletion reconciliation            |
| Security-event logging           | Retain and expand   | `api/auth`                |      2 onward | Structured outcomes, severity, correlation, hashed context, safe metadata                                |
| Profile editing                  | Move out            | `api/user`                | Separate plan | Auth must not expose profile mutation                                                                    |
| Profile image                    | Move out            | `api/user`                | Separate plan | Verification media remains Auth-owned and temporary                                                      |
| User preferences                 | Move out            | `api/user`                | Separate plan | Existing shared `UserPreference` is a User-domain record                                                 |
| User activity/history            | Move out            | `api/user`                | Separate plan | Authentication security events remain in Auth                                                            |
| Platform ID generation           | Conditional         | Product decision          |           2/5 | Preserve only if a documented business consumer requires it                                              |
| Administrator auth/review        | Exclude             | `api/admin`               | Separate plan | Admin credentials and authorization remain isolated                                                      |
| Signing/certificates             | Exclude             | `api/signature`           | Separate plan | Auth later supplies validated user claims and step-up assertions                                         |
| Direct Prisma service/schema     | Remove              | `api/db`                  |           1–2 | Auth consumes only `@mucyora/db`                                                                         |
| Synchronous mail send            | Replace             | Auth outbox/worker        |         5, 11 | Request transactions and responses do not depend on mail latency                                         |
| Scheduled token cleanup          | Retain and redesign | Auth worker               |            11 | Distributed locking, bounded batches, indexed expiry                                                     |
| Swagger and exception filters    | Retain and harden   | `api/auth`                |             1 | Production-disabled/protected docs and safe error mapping                                                |

## Endpoint Mapping

| Reference route                          | Target route                               | Decision                                                         |
| ---------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| `GET /health`                            | `GET /health/live`, `GET /health/ready`    | Replace with separate probes                                     |
| `POST /citizen/lookup`                   | `POST /api/v1/registration/citizen/lookup` | Temporary alias may be considered; do not duplicate indefinitely |
| `POST /users/register`                   | `POST /api/v1/registration`                | Replace with challenge-backed contract                           |
| `GET /users/verify-email`                | `POST /api/v1/registration/email/verify`   | Replace query-token flow with an explicit DTO                    |
| `POST /users/resend-verification`        | `POST /api/v1/registration/email/resend`   | Retain with anti-enumeration behavior                            |
| Reference login/refresh/logout routes    | `/api/v1/auth/*`                           | Normalize under the Auth contract                                |
| Reference password routes                | `/api/v1/passwords/*`                      | Separate password lifecycle from the general auth controller     |
| Reference verification submission/status | `/api/v1/identity-verification/*`          | Replace with attempt-bound workflow                              |
| User profile/preferences/activity routes | User-service routes                        | Do not implement in Auth                                         |
| FIN routes and branches                  | None                                       | Remove from MUCYORA Auth                                         |

Compatibility aliases require a documented consumer and removal date. They
must not be introduced automatically.

## Security Redesign Register

| Reference pattern                            | Risk                                                            | MUCYORA replacement                                                |
| -------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| bcrypt for new passwords                     | Does not match approved target profile                          | Argon2id; bcrypt only as a verified legacy-upgrade reader          |
| Shared `JWT_SECRET`                          | Broad cross-service signing authority and key-rotation coupling | Asymmetric Auth signing with public JWKS                           |
| AES-256-CBC without authenticated ciphertext | Ciphertext integrity is not guaranteed                          | AES-256-GCM or KMS envelope encryption with format versioning      |
| Plain SHA-256 of NID                         | Structured identifiers are enumerable                           | Versioned HMAC-SHA-256 lookup digest                               |
| Raw FIN in logs                              | Sensitive identifier disclosure                                 | Remove FIN support; never log raw government identifiers           |
| Direct Prisma ownership                      | Breaks schema ownership and least privilege                     | `@mucyora/db` only                                                 |
| In-memory citizen cache                      | Inconsistent across replicas                                    | Redis-compatible distributed cache; database remains authoritative |
| Process-local refresh coordination           | Refresh races across replicas                                   | Database-safe atomic rotation and replay detection                 |
| Memory-backed multipart uploads              | Memory exhaustion risk                                          | Direct private upload or bounded streaming                         |
| Human-readable provider/score failures       | Enumeration and policy disclosure                               | Stable safe reason codes and generic external errors               |
| Synchronous external work around workflows   | Latency and transaction/retry coupling                          | Short transactions, outbox, timeouts, circuit breakers             |

## Retained, Removed, and Redesigned Summary

Retain the user journeys for NIDA lookup, registration, email verification,
login, limited/full sessions, refresh rotation, password lifecycle, biometric
verification, session upgrade, attempt limits, and security events.

Remove FIN/foreign identity, Auth-owned profiles/preferences/activity,
Auth-owned Prisma, reference branding, development seed behavior from the
runtime service, and still-selfie liveness claims.

Redesign cryptography, token signing, session persistence, provider caching,
rate limiting, mail delivery, media handling, error contracts, audit context,
and all cross-service interfaces.

## Evidence and Limitations

The reference was inspected from its public GitHub archive. No credentials,
environment values, database data, or provider systems were accessed. The
archive contains source code but no canonical Prisma schema, so its persistence
shape was inferred from generated-client usage, services, tests, documentation,
and the current MUCYORA shared schema.
