# Citizen Lookup and Registration Challenges

## Implemented Contract

Phase 4 exposes:

```text
POST /api/v1/registration/citizen/lookup
```

The request contains:

```json
{
  "nid": "1000000000000001",
  "email": "user@example.com"
}
```

The `x-client-instance-id` header is required and must contain 16–128 safe
identifier characters. The email is normalized and bound to the challenge so
a later registration submission cannot substitute a different address.

The NID remains a string. Digits may be separated by spaces or hyphens, then
the application normalizes the value to exactly 16 digits.

## Successful Response

The endpoint returns HTTP `201` with:

```json
{
  "registrationChallengeToken": "mrc1.<opaque encrypted value>",
  "expiresAt": "2026-07-29T20:10:00.000Z",
  "citizen": {
    "surname": "Example",
    "givenNames": "Citizen",
    "dateOfBirth": "1998-12-31",
    "nationality": "Rwanda",
    "sex": "F"
  }
}
```

The response never contains the NID, HMAC lookup digest, provider reference,
portrait reference, document status, provider credentials, or raw provider
payload.

## Challenge Protection

- The default lifetime is ten minutes and startup bounds it to 2–15 minutes.
- The database row starts in `PENDING` state with zero attempts.
- The token encrypts the challenge UUID using purpose-bound AES-256-GCM.
- Attempt recording requires a pending, unconsumed, unexpired challenge below
  the configured maximum.
- Consumption is an atomic conditional update, so only one transaction can
  consume a challenge.
- The citizen snapshot is minimized, AES-GCM encrypted, and independently
  protected with a keyed digest.
- The normalized email and versioned NID HMAC are stored; the plaintext NID is
  not stored.

Phase 4 creates challenges. Phase 5 consumes them atomically to create a user,
credential, identity, consents, verification token, audit record, and outbox
event. Session and login behavior remains deferred.

## Distributed Abuse Controls

Redis-backed counters apply a one-minute window independently to:

- the keyed request-context digest of the source IP;
- the keyed request-context digest of the client instance;
- the versioned identity-lookup HMAC for the NID.

The initial defaults are 5/IP, 5/client, and 3/NID per minute. Redis failure
fails the route closed. Counter keys never include plaintext NIDs, IP
addresses, emails, or client identifiers.

## Enumeration and Errors

Missing, explicitly ineligible, and already-registered identities return the
same HTTP `422` code, stable application code, and message:

```text
REGISTRATION_INITIATION_UNAVAILABLE
```

Provider outages return `CITIZEN_PROVIDER_UNAVAILABLE`, and exceeded abuse
limits return `RATE_LIMIT_EXCEEDED`. Responses include the correlation ID.
Internal thresholds, provider diagnostics, and account state are not returned.

## Transaction Boundary

The provider lookup completes before the database transaction starts. The
short transaction performs only:

1. indexed identity uniqueness lookup;
2. challenge creation or generic denial;
3. minimized security-event creation.

No NIDA, Redis, email, object-storage, or Engine call occurs inside the
challenge-creation transaction.
