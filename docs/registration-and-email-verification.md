# Registration and Email Verification

## Phase 5 Scope

Phase 5 completes account creation and email verification. It does not issue
access or refresh tokens, create sessions, implement login, or mark biometric
identity verification complete.

## Registration

```text
POST /api/v1/registration
```

The request supplies the opaque Phase 4 challenge, the same email bound to that
challenge, a 15–128 character password, and exactly these versioned consents:

- `TERMS_OF_SERVICE`;
- `PRIVACY_POLICY`;
- `IDENTITY_DATA_PROCESSING`;
- `BIOMETRIC_PROCESSING`.

The `idempotency-key` header is required. Its keyed request digest and completed
user reference are committed in the same transaction as registration. An exact
completed replay returns the same public result; reuse for different input is
rejected.

The authoritative NID and citizen attributes come only from the encrypted,
integrity-checked challenge snapshot. Client-supplied names, dates, provider
references, or identifiers are not accepted.

Argon2id hashing is intentionally performed before the short database
transaction and is protected by a bounded in-process concurrency queue. The
transaction atomically:

1. records an eligible challenge attempt;
2. checks indexed normalized-email and identity-digest uniqueness;
3. creates the pending user;
4. creates the Argon2id credential;
5. creates the encrypted NIDA identity;
6. stores all four consent versions;
7. stores only the email-token digest;
8. atomically consumes the challenge;
9. creates the encrypted-token email outbox event;
10. creates the registration security event.
11. completes the idempotency record.

Any failed write rolls back the entire transaction. NIDA, Redis, mail, S3, and
Engine are never called inside it.

## Password Policy

- 15–128 Unicode characters;
- no arbitrary composition rules;
- no silent truncation;
- common/compromised local blocklist;
- rejection when the password contains the email local part;
- Argon2id with startup-bounded memory, time, and parallelism settings.

The bundled blocklist is a baseline. Production should maintain an approved,
versioned offline compromised-password corpus without sending passwords to an
external API.

## Email Verification

```text
POST /api/v1/registration/email/verify
POST /api/v1/registration/email/resend
```

Verification tokens contain at least 32 random bytes, use URL-safe encoding,
and are stored only as keyed digests. The verification transaction
conditionally consumes one active, unexpired, non-superseded token; activates
the email/account state; writes an audit event; and creates a welcome/next-step
outbox event. Parallel consumption permits only one success.

Resend is limited independently by keyed IP and normalized-email digests. Its
HTTP `202` response is the same for unknown, verified, and pending accounts.
For an eligible pending account, the transaction supersedes older active
tokens and creates a new digest and encrypted-token outbox event.

## Asynchronous Mail

Registration and resend never wait for the mail provider. Outbox payloads hold
the recipient and AES-GCM ciphertext of the raw verification token. The raw
token is decrypted only in worker memory and appears only in the generated
action URL.

The worker:

- reads a bounded batch using the unpublished index;
- acquires a per-event Redis lock across replicas;
- sends through the fixed, redirect-disabled mail-provider adapter;
- marks the event published only after success;
- stores only `MAIL_DELIVERY_FAILED` on failure;
- stops retrying automatically after ten attempts.

Delivery is at-least-once: a process crash after provider acceptance but before
the published update can duplicate an email. Templates and provider requests
must therefore remain idempotent and safe to repeat.
