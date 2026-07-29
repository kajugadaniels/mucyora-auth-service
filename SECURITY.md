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
- Keep Swagger disabled unless there is an approved operational need.
- Use readiness for traffic admission and liveness only for process recovery.

## Incident Priorities

Immediately escalate suspected leakage of credentials, signing material,
tokens, NID data, biometric media, or database access. Preserve safe audit
evidence, revoke affected access through an approved procedure, and avoid
destroying records needed for investigation.
