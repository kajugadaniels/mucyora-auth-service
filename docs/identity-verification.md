# Account Identity Verification

## Phase 8 Scope

Phase 8 implements NIDA-linked account-enrollment verification. It does not
upgrade the caller’s existing limited session; session-family replacement is
reserved for Phase 9.

## Preconditions

The caller must have an active limited or full Auth session. Attempt creation
also requires:

- an active account with verified email;
- an existing NIDA-linked `CitizenIdentity`;
- active biometric-processing consent;
- identity verification not already complete;
- no active account-enrollment attempt;
- available capacity in the configured rolling attempt window;
- any previous `retryAfter` deadline to have passed.

## Workflow

1. `POST /api/v1/identity-verification/attempts`
2. `POST /api/v1/identity-verification/attempts/:attemptId/upload-policy`
3. Upload the ID document directly to the returned private S3 policy.
4. `POST /api/v1/identity-verification/attempts/:attemptId/media/confirm`
5. `POST /api/v1/identity-verification/attempts/:attemptId/liveness-session`
6. Complete the approved AWS Face Liveness capture.
7. `POST /api/v1/identity-verification/attempts/:attemptId/submit`
8. Poll `GET /api/v1/identity-verification/attempts/:attemptId` or
   `GET /api/v1/identity-verification/status`.

## Media Security

Auth issues a short-lived presigned POST for a random object below:

```text
identity-verification/<attempt UUID>/<random UUID>
```

The policy fixes the key, content type, SHA-256 checksum, attempt identifier,
media type, dimensions, maximum byte length, and expiry. Confirmation performs
an S3 metadata lookup before storing a purpose-bound encrypted reference.

Only JPEG and PNG ID documents are accepted. Auth bounds declared dimensions
and pixels; Engine validates actual bytes, format, dimensions, and size before
biometric processing. Media never uses local disk.

## Engine Boundary

Auth calls Engine with HMAC-signed requests containing:

- caller and audience;
- timestamp and unique nonce;
- SHA-256 body digest;
- request, attempt, user, and idempotency identifiers;
- attempt-bound private media reference;
- provider-created liveness-session reference;
- policy version and document-binding state.

Raw or encrypted NIDs are never sent to Engine. Engine stores request nonces in
Redis to reject replay and caches liveness/evaluation idempotency results.

Engine uses AWS Face Liveness session results. The removed still-selfie
brightness, eyes-open, sharpness, and pose heuristic is not treated as
liveness.

## Outcomes

Engine returns one normalized outcome:

- `PASS`
- `FAIL`
- `RETRY`
- `MANUAL_REVIEW`
- `PROVIDER_UNAVAILABLE`
- `INVALID_REQUEST`

Auth persists safe scores and a bounded reason code without exposing policy
thresholds. Provider failures remain `PROVIDER_UNAVAILABLE`; they are never
recorded as an identity mismatch.

On pass, one short database transaction marks the attempt passed and the user
identity verified, writes a security event, and creates an outbox event. It
does not issue a full session.

## Cleanup

Terminal pass/fail/retry media is deleted immediately when possible. Manual
review media remains under its retention deadline. Expired undeleted media is
retried by a bounded reconciliation worker using the schema cleanup index.
