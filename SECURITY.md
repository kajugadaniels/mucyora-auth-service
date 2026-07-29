# MUCYORA Auth Security Policy

## Scope

This policy covers the authentication service, including its HTTP boundary,
runtime configuration, database access, future credentials and sessions, NIDA
integration, and identity-verification orchestration.

## Reporting a Vulnerability

Report suspected vulnerabilities privately to the MUCYORA security team. Do
not include production credentials, raw tokens, national identifiers,
biometric media, or database exports in an issue or chat message.

Include:

- the affected component and version;
- a minimal reproduction using synthetic data;
- the expected and observed impact;
- any relevant safe logs or correlation IDs;
- whether active exploitation is suspected.

Do not perform destructive testing, access another person’s account, call real
identity providers without authorization, or publish an unpatched issue.

## Trust Boundaries

- Auth is the only issuer of user access and refresh sessions.
- `api/admin` owns administrator authentication and authorization.
- `api/db` owns Prisma schema, migrations, generated clients, and grants.
- `api/engine` owns biometric computation, not user state.
- `api/signature` owns signing keys, certificates, and signatures.
- `api/user` owns profiles, devices, ownership, transfers, and agreements.

## Foundation Controls

- The service listens only on fixed port `3000`.
- Production database connections must use `mucyora_auth_app`.
- Browser origins use an exact allowlist; wildcard origins are rejected.
- Credentialed CORS never combines with a wildcard.
- Request bodies are limited before controller processing.
- Unknown DTO properties are rejected.
- Helmet supplies secure HTTP headers.
- Unexpected errors return a generic response without stack traces.
- Correlation IDs are validated or generated and returned to callers.
- Logs are structured and must not contain secrets or identity values.
- Swagger is disabled by default and requires Basic authentication when
  explicitly enabled in production.
- Liveness performs no dependency calls.
- Readiness checks database availability and caches the result briefly.
- Shutdown hooks close database connections.
- Identity lookup uses a versioned keyed digest, not plain SHA-256.
- Protected identity values use AES-256-GCM authenticated encryption.
- Encryption, identity lookup, token, and request-context keys are
  purpose-separated.
- Opaque tokens use cryptographically secure randomness and digest-only
  persistence contracts.
- Security-event metadata rejects sensitive fields and structured payloads.
- Citizen-provider destinations are fixed at startup, redirects are disabled,
  production requires HTTPS, and certificate verification remains enabled.
- Citizen-provider retries are bounded and protected by a circuit breaker.
- Citizen cache keys use versioned HMAC digests and positive cache values use
  purpose-bound AES-256-GCM encryption.
- Provider responses are schema-validated and minimized before leaving the
  adapter.
- Citizen lookup is limited independently by keyed IP, client-instance, and
  NID dimensions in Redis.
- Missing, ineligible, and registered identities use the same external denial.
- Registration challenge tokens encrypt their database identifiers and expire
  within a bounded short lifetime.
- Challenge attempt and consumption operations use conditional database
  updates; only one transaction can consume a pending challenge.
- New passwords use bounded-concurrency Argon2id and a common-password policy.
- Registration atomically stores the credential, encrypted identity, consent
  versions, token digest, challenge consumption, audit, and outbox record.
- Email verification tokens are random, digest-only, expiring, supersedable,
  and atomically single-use.
- Raw email tokens appear in durable outbox state only as purpose-bound
  AES-GCM ciphertext.
- Resend uses generic responses and keyed Redis limits by IP and email.
- Mail delivery occurs after commit with per-event Redis locks and safe failure
  codes.
- Access tokens use a matching Auth-owned RSA private key and public JWKS.
- Access claims exclude identity/profile data and protected routes confirm the
  database session remains active.
- Unknown-account login performs dummy Argon2 verification and shares the
  wrong-password response.
- Refresh tokens are digest-only, generation-bound, atomically rotated, and
  coordinated across replicas with Redis locks.
- Reuse outside the grace period compromises only the affected session family
  and creates a high-severity event.
- Browser refresh cookies are scoped, HttpOnly, secure in production, and
  protected by an HMAC-bound double-submit CSRF token.
- Session revocation atomically revokes associated refresh records.

## Sensitive Data

Never log or return:

- passwords or password hashes;
- raw verification, reset, refresh, or access tokens;
- Authorization or cookie values;
- plaintext NID or other government identifiers;
- encryption, HMAC, signing, or provider keys;
- database connection strings;
- biometric images or raw provider responses;
- private object-storage references.

Phase 2 cryptography and token utilities follow the implementation plan and
reviewed database contract. They are reusable primitives only; later workflow
phases must still use them correctly and atomically.

Phase 3 uses those primitives for the private citizen-provider cache. It does
not expose a citizen lookup endpoint, persist provider payloads, or create user
records.

Phase 4 exposes only registration initiation. It persists an encrypted,
minimized challenge and never creates a user account. The normalized email is
bound to the challenge, while the plaintext NID is neither stored nor returned.

Phase 5 consumes that challenge to create the account. It does not issue a
session or access token. Phase 6 performs that work only after valid
credentials and account gates.

## Database Safety

Auth imports database behavior only from `@mucyora/db`. This repository must
not contain a Prisma schema, migrations, generated Prisma client, Prisma CLI,
or `DATABASE_MIGRATION_URL`.

The runtime role must not have DDL or migration privileges. Schema changes are
reviewed and executed in `api/db`.

## Deployment

- Inject secrets through the deployment platform.
- Do not bake `.env` files into images.
- Run the container as its non-root user.
- Terminate TLS at an approved trusted boundary.
- Restrict database and future internal-provider egress.
- Restrict citizen-provider and Redis egress to their approved destinations.
- Require provider HTTPS and Redis TLS in production.
- Keep Swagger disabled unless there is an approved operational need.
- Use readiness for traffic admission and liveness only for process recovery.

## Incident Priorities

Immediately escalate suspected leakage of credentials, signing material,
tokens, NID data, biometric media, or database access. Preserve safe audit
evidence, revoke affected access through an approved procedure, and avoid
destroying records needed for investigation.
