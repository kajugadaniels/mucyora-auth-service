# Password Lifecycle

## Phase 7 Scope

Phase 7 implements password recovery and authenticated password change. It
does not implement biometric identity verification or session upgrade.

## Recovery Request

```text
POST /api/v1/auth/password/forgot
```

The endpoint always returns `{ "status": "accepted" }` for a valid email
shape, whether or not an eligible account exists. Redis applies independent
hourly limits to keyed IP and normalized-email digests.

For an active, verified account, Auth:

1. revokes any outstanding recovery requests;
2. stores a new random token only as an indexed keyed digest;
3. stores the request IP only as a keyed digest;
4. places a purpose-bound encrypted token in the transactional outbox;
5. records a minimized security event.

Mail delivery occurs asynchronously after the transaction commits.

## Password Reset

```text
POST /api/v1/auth/password/reset
```

The submitted token is converted to its keyed digest for an indexed lookup.
Expired, used, revoked, unknown, or ineligible requests share the same safe
error. The password policy rejects common, email-derived, short, oversized,
or otherwise disallowed passwords.

The reset transaction conditionally consumes the request. Exactly one
concurrent caller can succeed. It then:

- replaces the credential with the configured Argon2id profile;
- clears failed-login lock state;
- revokes every other recovery request;
- revokes all active sessions and refresh tokens without a global scan;
- queues a password-changed security notification;
- records the password-change security event.

The user must sign in again after a successful reset.

## Authenticated Change

```text
POST /api/v1/auth/password/change
Authorization: Bearer <access-token>
```

The caller must have an active limited or full session and supply the current
password. The new password cannot equal the current password and must pass the
same password policy. A compare-and-set credential update prevents concurrent
changes from silently overwriting one another.

A successful change revokes all sessions, refresh tokens, and outstanding
recovery requests. The caller must sign in again.

## Operational Controls

- `PASSWORD_RESET_TOKEN_TTL_SECONDS` controls recovery-token lifetime.
- `PASSWORD_RESET_LIMIT_PER_HOUR` controls recovery request and consumption
  attempts.
- `PASSWORD_CHANGE_LIMIT_PER_HOUR` controls authenticated change attempts.
- `PASSWORD_HASH_MAX_CONCURRENCY` bounds expensive Argon2 work per process.
- Redis is required for distributed abuse control.
- The outbox worker must be enabled in environments that deliver mail.
