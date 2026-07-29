# Operational Jobs

## Execution Model

Phase 11 maintenance is disabled by default. Enabled workers acquire an
owner-checked Redis lease so only one replica executes each job at a time.
Every database operation first selects an indexed, bounded set of identifiers
and then conditionally updates or deletes only those records.

`OPERATIONAL_JOBS_ENABLED` controls database retention jobs.
`MAIL_OUTBOX_WORKER_ENABLED` controls mail delivery.
`VERIFICATION_CLEANUP_ENABLED` controls media deletion and object-storage
reconciliation. This separation allows workers to scale independently.

## Outbox Delivery

Eligible events are indexed by publish state, dead-letter state, next attempt,
and creation time. Delivery uses:

1. a batch leader lease;
2. a conditional database processing lease;
3. a stable event ID as the provider idempotency key;
4. bounded exponential backoff after failure;
5. explicit dead-lettering after `OUTBOX_MAX_ATTEMPTS`.

Payload validation rejects unknown fields. Worker logs and database errors use
stable codes and never include recipients, tokens, payloads, or provider
responses.

## Retention and Recovery

The operational cycle performs bounded cleanup for:

- expired email and password-reset tokens;
- expired idempotency and step-up records;
- expired refresh tokens;
- active sessions whose expiry has passed;
- retained expired, revoked, or compromised sessions;
- stale non-terminal verification attempts;
- security events beyond retention without an active legal hold.

Stale attempts are marked `EXPIRED`; their non-held media becomes eligible for
the media worker. Manual-review media and active legal holds are preserved.

## Media and Orphans

Failed object deletion records a safe error code, increments an attempt count,
and schedules exponential retry. Orphan reconciliation pages through the
private verification prefix and waits through
`VERIFICATION_ORPHAN_GRACE_SECONDS`. It deletes an object only when its keyed
reference digest is absent from `verification_media`.

## Dashboard and Alerts

An authorized operations client can read:

```text
GET /api/v1/internal/operations/jobs
X-Mucyora-Service-Name: mucyora-operations
X-Mucyora-Service-Key: <dedicated-secret>
```

The response contains only timestamps, safe status codes, and aggregate
counts. Dead letters and cycle failures emit structured
`operational_job_alert` events without exception or payload details.

Phase 12 still owns load testing, query-plan measurement, and SLO validation.
