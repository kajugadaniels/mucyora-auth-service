# Step-Up Identity Verification

## Scope

Phase 10 provides fresh proof for:

- `DEVICE_TRANSFER`, consumed only by `mucyora-user`;
- `AGREEMENT_SIGNING`, consumed only by `mucyora-signature`;
- `ACCOUNT_RECOVERY`, consumed only by `mucyora-auth-recovery`.

It does not authorize the protected business operation itself. The consuming
service remains responsible for ownership, authorization, and transaction
rules around its target resource.

## Challenge Workflow

An authenticated full session creates a challenge:

```text
POST /api/v1/step-up/challenges

{
  "purpose": "DEVICE_TRANSFER",
  "targetResourceId": "transfer-123"
}
```

Auth stores only an HMAC of the purpose and target identifier. The response
contains the `verificationAttemptId`; the caller completes the existing
attempt-bound upload, liveness, and submit routes. Step-up attempts use
`STEP_UP_POLICY_VERSION`, separate from account enrollment.

After the linked attempt passes:

```text
POST /api/v1/step-up/challenges/:challengeId/assertion
```

The returned opaque assertion expires no later than either the configured
assertion lifetime or its parent challenge. Auth stores a keyed digest and a
purpose-bound encrypted replay envelope, never a plaintext assertion.

## Internal Consumption

Authorized services call:

```text
POST /api/v1/internal/step-up/assertions/consume
X-Mucyora-Service-Name: mucyora-user
X-Mucyora-Service-Key: <dedicated-secret>

{
  "assertion": "<opaque-token>",
  "userId": "<uuid>",
  "purpose": "DEVICE_TRANSFER",
  "targetResourceId": "transfer-123"
}
```

Auth verifies the service-to-purpose mapping, assertion digest, user, purpose,
target HMAC, state, and expiry. A conditional update changes `VERIFIED` to
`CONSUMED`; concurrent calls therefore have one winner and replay fails.

## Expiry and Reuse

Challenge access, creation, assertion issuance, and consumption lazily expire
due records using the status/expiry index and remove encrypted assertion
material. Phase 11 will provide bounded scheduled cleanup.

Recent-proof reuse is intentionally disabled. Every Phase 10 challenge creates
a fresh Engine-backed attempt until a separately reviewed policy establishes
safe reuse rules for a specific purpose.
