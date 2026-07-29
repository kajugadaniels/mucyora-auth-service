# Authentication Database Change Proposal

## Status and Ownership

This document began as the Phase 0 proposal. Phase 2 now implements its
additive shared contract in:

```text
api/db/prisma/migrations/20260729200000_add_auth_security_contract/migration.sql
```

The migration has been created and statically validated but has not been
applied. `api/db` continues to own schema, migration SQL, generated clients,
database roles, and grants.

Before applying it, inspect normalized-email collisions, confirm a backup and
rollback procedure, review runtime grants, and validate compatibility in a
non-production Neon branch.

## Current-to-Target Gap

| Current model | Current limitation | Proposed target |
|---|---|---|
| `User` | Email is not separately normalized; password is stored on User; boolean account states; no optimistic version | Keep account identity/state only; add normalized email, timestamps/status enums, version |
| `CitizenIdentity` | Supports legacy FIN; ordinary hash; CBC-era column names; no key/source versions or masked value | Evolve or migrate to a NIDA-only `UserIdentity`-equivalent record with encrypted identifier and versioned HMAC digest |
| `PlatformId` | Business requirement is not documented | Preserve only if an active consumer requires it; otherwise deprecate through a separately reviewed migration |
| `EmailVerificationToken` | One row per user, boolean use state, token hash not unique | Digest uniqueness, `usedAt`, `supersededAt`, indexed expiry |
| `PasswordResetToken` | Boolean use state and no revoke/request context | `PasswordResetRequest` equivalent with `usedAt`, `revokedAt`, hashed request context |
| `RefreshToken` | Directly attached to User; no session family, generation, replacement, use, or reuse evidence | Add `AuthSession`; attach generation-based refresh records to a session |
| `IdVerification` | Terminal boolean result; no purpose/status/policy/media/liveness/session lifecycle | `IdentityVerificationAttempt` plus `VerificationMedia` |
| `SecurityEventLog` | Minimal event and raw IP fields; no outcome/severity/correlation/session/reason | Evolve to structured `SecurityEvent` equivalent with hashed context and safe metadata |
| None | Provider lookup cannot issue a durable single-use handoff | Add `RegistrationChallenge` |
| None | Consent version/evidence cannot be proven | Add `UserConsent` |
| None | Retried public writes lack durable request binding | Add `IdempotencyRecord` |
| None | Email/notification work cannot commit atomically with state | Add `OutboxEvent` |

## Proposed Durable Contract

### Account and credentials

- Keep `User.id` stable to protect all existing foreign keys.
- Add `emailNormalized` with a unique constraint after collision analysis and
  backfill.
- Replace boolean account state with explicit account and identity-verification
  statuses, while preserving compatibility during migration.
- Add `emailVerifiedAt` and optimistic `version`.
- Move password material to one `UserCredential` record per user:
  `passwordHash`, algorithm, change time, failed count, lock time, and
  timestamps.

### NIDA identity

- Preserve existing `CitizenIdentity.id` and `userId` where practical.
- Introduce `encryptedIdentifier`, `identifierLookupDigest`,
  `maskedIdentifier`, `encryptionVersion`, `lookupKeyVersion`, `source`,
  `sourceReference`, and `verifiedAt`.
- Normalize NID to exactly 16 digits before cryptographic operations.
- Use `HMAC-SHA-256(normalizedNid, lookupKey)` for equality/uniqueness.
- Use AES-256-GCM or a KMS envelope with explicit format and key versions.
- Do not silently reinterpret existing CBC ciphertext or plain SHA-256 hashes.
- Treat `FIN`, `finEncrypted`, `finHash`, and foreign-identity admin actions as
  legacy. Removal requires data discovery and a separately approved migration.

### Registration

Add `RegistrationChallenge` with:

- an opaque primary identifier;
- NID lookup digest and normalized email;
- encrypted/minimized citizen snapshot plus digest;
- status, expiry, consumption time, attempt count, hashed request context, and
  timestamps.

The challenge must be short-lived and single-use. Its unique/locking strategy
must prevent two registration transactions from consuming it successfully.

### Verification and recovery tokens

- Store only token digests.
- Add unique digest constraints.
- Represent consumption and invalidation with timestamps.
- Index pending tokens by expiry.
- Permit safe token supersession without deleting audit evidence.

### Sessions and refresh tokens

Add `AuthSession` with family, level, status, device label/identifier, hashed IP
and user agent, activity/expiry/revocation fields, and optimistic version.

Evolve `RefreshToken` to reference a session and record:

- digest;
- generation;
- issuance and expiry;
- use and revocation;
- replacement token;
- reuse detection.

Enforce a unique session/generation pair. Rotation and reuse handling must be a
short atomic database operation, not process-local coordination.

### Identity verification

Add a lifecycle-oriented `IdentityVerificationAttempt` containing purpose,
status, policy version, Engine request, liveness session, normalized score
evidence, stable reason code, attempt sequence, timing, retry time, and hashed
request context.

Add `VerificationMedia` with an attempt relation, media type, opaque/encrypted
object reference, object version, checksum, content type, byte size, expiry,
deletion time, and creation time.

The database stores evidence metadata, not biometric object bytes.

### Consent, security, idempotency, and outbox

- `UserConsent`: consent type, policy version, grant/revoke time, minimized
  evidence.
- `SecurityEvent`: user/session, event type, severity, outcome, reason,
  correlation, hashed request context, safe metadata, timestamp.
- `IdempotencyRecord`: scope/key/request digest, response reference, status,
  expiry, timestamp.
- `OutboxEvent`: aggregate identity, event type, minimized payload, publication
  state, attempts, and safe failure information.

## Constraints and Indexes

Required design targets:

- unique normalized email;
- unique active NIDA lookup digest;
- unique token digests;
- unique `(sessionId, generation)`;
- atomic single consumption for challenge, verification, and reset tokens;
- unique `(scope, key)` with request-digest conflict detection for idempotency;
- active-session lookup indexes;
- pending-token expiry indexes;
- pending verification and retry indexes;
- expired undeleted media cleanup index;
- unpublished outbox index ordered for bounded polling;
- optimistic versions on session-sensitive records.

Partial indexes or database checks that Prisma cannot express should be
implemented in reviewed migration SQL and documented in the Prisma schema.

## Migration Strategy

The owning database change should be split into reversible, observable steps:

1. inspect live data shape and consumers without exposing sensitive values;
2. add new nullable columns/tables/indexes;
3. deploy dual-read compatibility where required;
4. backfill normalized email and detect collisions before uniqueness;
5. create credentials from existing hashes while marking their algorithm;
6. backfill identity digests/encryption only through an approved key-aware job;
7. introduce new session/token writes without silently invalidating sessions;
8. migrate consumers and verify counts/invariants;
9. enforce non-null and uniqueness constraints;
10. deprecate legacy columns only after all consumers and rollback windows are
    closed.

Applied migrations must never be rewritten or deleted. `prisma db push` is not
an acceptable shared-database migration mechanism.

## Compatibility Risks Requiring Decisions

- Existing NID ciphertext format and key material must be identified before
  backfill; authenticated encryption cannot be inferred from the column name.
- `nidHash` may contain enumerable SHA-256 values and must not be reused as the
  final lookup digest.
- Existing password hashes may be bcrypt. Preserve the algorithm marker and
  upgrade only after successful password verification.
- Existing refresh tokens lack a session family. A rollout policy must decide
  whether to grandfather, exchange, or explicitly expire them with user notice.
- Signature currently reads verified user and citizen identity records. Field
  migration needs a compatibility window.
- Admin reads Auth security and verification records. Its queries and grants
  must be updated with the schema.
- Removing FIN-related fields requires confirmation that no retained records or
  regulatory retention obligations exist.
- Platform ID cannot be removed until its consumers are inventoried.

## Runtime Privilege Proposal

The `mucyora_auth_app` role should receive only the Auth operations required for
account, credential, NIDA identity, challenge, token, session, verification,
media metadata, consent, security-event, idempotency, and outbox workflows.

It must not receive migration/DDL privileges or write access to signature,
device, agreement, payment, or administrator credential records. Read access
for cross-domain checks must be explicit, minimal, and documented in the shared
privilege matrix.

## Approval Boundary

Phase 2 can consume this contract only after:

- a new explicit Phase 2 command;
- explicit authorization for any required `api/db` work;
- migration review;
- compatibility and rollback decisions;
- confirmation that no production secret or raw identifier enters source
  control.
