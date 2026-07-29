# Current-State Audit

## Audit Scope

This audit covers Phase 0 of `MUCYORA_AUTH_IMPLEMENTATION_PLAN.md`:

- the current `api/auth` scaffold;
- the public reference auth service at revision `a2affdc`;
- the exports and Prisma schema in `api/db`;
- the current biometric contract in `api/engine`;
- the Auth-facing boundaries in `api/user`, `api/admin`, and `api/signature`.

It does not introduce runtime behavior, change an API contract, access
production data, call a provider, or apply a migration.

## Executive Finding

`api/auth` is a buildable NestJS starter with domain module shells, a fixed
port, base documentation, and a declared dependency on `@mucyora/db`. It is
not yet an authentication implementation. The only route is the Nest starter
`GET /`, and the domain modules contain no controllers or services.

This is a safe starting point because very little legacy runtime behavior must
be preserved. The existing project boundary, fixed port, shared database
dependency, documentation rules, and strict TypeScript settings should be
retained.

## Existing Auth Inventory

### Runtime

- NestJS 11 and TypeScript are configured.
- `src/main.ts` listens on the fixed Auth port `3000`.
- `src/app.module.ts` imports empty shells for authentication, registration,
  identity verification, sessions, password, OTP, health, and common concerns.
- `GET /` returns `Hello World!`.
- There is no global API prefix, configuration validation, DTO validation,
  Helmet, CORS policy, structured logging, exception filter, body-size policy,
  graceful shutdown, Swagger setup, or readiness/liveness implementation.

### Dependencies

Already present and reusable after configuration:

- `@mucyora/db` through `file:../db`;
- Nest config, JWT, Passport, Swagger, and throttler packages;
- Argon2, class validation/transformation, cookie parser, Helmet, Joi, UUID,
  and RxJS.

Missing for later authorized phases include the approved HTTP adapter,
distributed cache, scheduling, object-storage, and observability dependencies.
Dependencies must be added only in the phase that uses and validates them.

### Tests

- one starter controller unit test;
- one starter end-to-end test;
- no security, contract, integration, concurrency, failure-mode, or performance
  tests.

### Documentation

The README and current documents correctly distinguish planned behavior from
implemented behavior. Their existing filenames differ from the target tree but
should not be renamed merely for cosmetic parity. Later phases may extend the
current documents or add focused documents when they contain distinct
operational value.

`SECURITY.md` is currently absent at the project root and is a Phase 1 gap.

### Repository Boundary

No Auth-local Prisma schema, migrations, Prisma configuration, or generated
client exists. This already satisfies the database ownership boundary.

## Shared Database Assessment

`@mucyora/db` exports:

- `createPrismaClient`;
- `createPrismaClientOptions`;
- database URL normalization;
- the generated Prisma client and generated types.

The factory uses the PostgreSQL adapter and `DATABASE_URL`. Auth can wrap this
factory in a Nest lifecycle service during Phase 1 or Phase 2 without importing
Prisma tooling.

The current schema supports legacy/basic equivalents for:

- `User`;
- `CitizenIdentity`;
- `PlatformId`;
- `EmailVerificationToken`;
- `PasswordResetToken`;
- `IdVerification`;
- `RefreshToken`;
- `SecurityEventLog`.

It does not satisfy the final Auth contract. Detailed proposed changes are in
`database-change-proposal.md`. No database file was modified by this audit.

## Sibling-Service Alignment

### Engine

The Engine is an internal FastAPI biometric computation service. Its current
request accepts:

- `id_image_key`;
- `selfie_image_key`;
- `user_id`;
- a caller-supplied `document_match` boolean.

Its response returns pass/fail, face/liveness/document/composite scores,
human-readable failure text, and image-quality strings.

This contract is not sufficient for Phase 8 because it lacks an attempt-bound
request identifier, authenticated/replay-resistant request evidence,
policy-version binding, a provider-backed liveness session identifier,
idempotency, stable reason codes, and explicit unavailable/review states.
Phase 8 must coordinate an Engine contract change; Phase 0 does not change it.

### Signature

Signature correctly owns signing keys, certificates, signing, and verification.
It currently validates Auth-issued user tokens with a shared symmetric
`JWT_SECRET` and requires a full token for protected signing behavior.

Phase 6 must coordinate migration to Auth JWKS, issuer, audience, key ID, and
claim validation. Phase 10 must add purpose-bound step-up assertions without
moving signing policy into Auth.

### User

User is the correct owner for profile, preference, device, IMEI, ownership,
transfer, and agreement behavior. It expects trusted identity claims from Auth
and consumes `@mucyora/db`. Auth must not copy the reference service's profile,
preference, activity, or profile-image routes.

### Admin

Admin remains the owner of administrator credentials, roles, permissions,
review, dispute, and privileged operations. Auth may publish security and
identity-verification evidence for authorized review, but it must not issue
administrator tokens or make final manual-review decisions.

## Boundary Decisions

| Concern | Decision |
|---|---|
| `AuthModule` name | Preserve initially; decide an intentional rename to `AuthenticationModule` during Phase 1 rather than create a duplicate |
| `PasswordModule` name | Preserve initially; pluralization alone does not justify churn |
| `OtpModule` | Reassess in Phase 1; split into email verification or step-up only when supported by a real workflow |
| Root starter endpoint | Replace with explicit health routes in Phase 1 |
| Fixed port `3000` | Preserve |
| `@mucyora/db` | Preserve as the only database package |
| Platform ID | Retain only after a consumer/business requirement is documented |
| FIN/foreign identity | Exclude from Auth; legacy schema fields are a database migration decision |
| User profile/preferences/activity | Exclude and leave to `api/user` |
| Admin authentication | Exclude and leave to `api/admin` |
| Signing/certificates | Exclude and leave to `api/signature` |

## Performance Findings

The current Auth scaffold has no business operations to benchmark. The
reference identifies patterns that must not be carried forward:

- in-process NIDA caching cannot coordinate replicas;
- process-local refresh serialization cannot prevent cross-instance races;
- memory-backed multipart media can exhaust heap under concurrency;
- long bcrypt work needs bounded concurrency even when migrated to Argon2id;
- provider, mail, and Engine calls require explicit timeouts and circuit
  behavior;
- external calls must not run inside database transactions;
- cleanup must not depend on an uncoordinated scheduler in every replica.

No production-like latency claims can be made until the relevant phases have
instrumented and measured these paths.

## Security Findings

High-priority future controls:

- strict startup configuration validation;
- global DTO validation and safe error mapping;
- structured redacted logging with correlation IDs;
- Argon2id and a bounded legacy bcrypt upgrade path;
- versioned HMAC identity lookup;
- authenticated AES-GCM/KMS encryption;
- asymmetric JWT signing and JWKS;
- digest-only opaque tokens;
- distributed throttling and atomic session operations;
- anti-enumeration behavior;
- temporary private, attempt-bound verification media;
- authenticated and replay-resistant Engine requests.

No reference credential, token, identity value, or secret was copied.

## Phase-by-Phase Change Map

| Phase | Planned change | Preserved baseline | Primary prerequisite or risk |
|---:|---|---|---|
| 0 | Audit and proposals only | Current scaffold and docs | Complete |
| 1 | Secure Nest foundation, probes, boundary checks, DB lifecycle, CI/docs | Fixed port, packages, module shells | Do not add business endpoints |
| 2 | Consume approved DB contract and add crypto/security primitives | `@mucyora/db` factory | Requires separately authorized `api/db` migration work |
| 3 | Typed NIDA adapter, minimized mapping, resilience and mock tests | Registration module shell | Distributed cache and safe secret configuration |
| 4 | Citizen lookup and registration challenge | Complete | Protected endpoint, encrypted short-lived challenge, distributed abuse controls, and anti-enumeration |
| 5 | Atomic registration and email verification | Complete | Argon2id credential, encrypted identity, versioned consents, digest tokens, outbox mail, verification and resend |
| 6 | Login, asymmetric JWT/JWKS, refresh/session management | Auth and sessions shells | Consumer migration from shared JWT secret |
| 7 | Password recovery/change | Password shell | Password reset/session revocation contract |
| 8 | Attempt-bound biometric verification | Identity-verification shell, Engine service | Hardened Engine/liveness and media contracts |
| 9 | Limited-to-full session upgrade | Phase 6 and Phase 8 state | Atomic, idempotent upgrade |
| 10 | Purpose-bound step-up verification | Verification infrastructure | User/Signature contract tests |
| 11 | Outbox, cleanup, reconciliation, retention | Durable records from earlier phases | Distributed job coordination |
| 12 | Load, resilience, query-plan, and SLO validation | Instrumented runtime | Production-like non-production environment |
| 13 | Final threat review and release package | All prior phases | No deployment without separate command |

## Phase 0 Exit Decision

Phase 1 may proceed only after a new explicit command. Phases 2 and 3 remain
blocked by the command-gated protocol even if they were named in the same
multi-phase request. Database migration design and execution require separate,
explicit authorization within the owning `api/db` project.
