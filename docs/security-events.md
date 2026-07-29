# Authentication Security Events

## Durable Contract

Phase 2 introduces `auth_security_events`, separate from the legacy
`security_event_logs` table. The new record includes:

- optional user and session references;
- a constrained event type;
- severity and outcome;
- a stable reason code;
- correlation ID;
- hashed IP and user-agent context;
- minimized safe metadata;
- server-side creation time.

## Writer Rules

`SecurityEventWriter`:

- accepts generated enum values from `@mucyora/db`;
- writes one event and selects only its identifier;
- permits at most 20 metadata fields;
- permits scalar metadata values only;
- limits string metadata values to 256 characters;
- rejects sensitive metadata keys such as passwords, tokens, secrets, cookies,
  NIDs, identity values, and biometric values.

Callers must hash network and user-agent context with the
request-context HMAC primitive before writing it.

## Event Types

The Phase 2 contract reserves events for:

- registration challenge and completion;
- email verification;
- login outcomes;
- session refresh and revocation;
- refresh-token replay;
- password reset and change;
- identity-verification start and completion;
- rate-limit enforcement.

Implemented workflows write these events atomically where the state transition
requires durable evidence. Step-up challenges reuse identity-verification
start/completion event types with bounded purpose-specific reason codes; no
target identifier or assertion is included.

## Operational Rules

- Security events are append-only application evidence.
- Safe metadata is not a substitute for domain records.
- Event-write failure policy must be decided per workflow.
- High-risk state transitions should fail closed or use an atomic outbox when
  loss of the event would remove required evidence.
- Admin may receive reviewed read access, but Auth remains the event writer.
- Phase 11 deletes events only after the configured retention cutoff and never
  while an active legal hold applies.
