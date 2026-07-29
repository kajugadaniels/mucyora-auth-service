# Phase 12 Performance Validation

## Scope and Safety

All measurements use synthetic strings and local cryptographic keys. No real
NID, account, credential, refresh token, NIDA endpoint, production Redis, or
production database was used.

Measured locally on July 30, 2026:

- macOS 13.7.8, x86_64;
- Node.js 24.12.0;
- Argon2id memory 65,536 KiB, time cost 3, parallelism 1.

## Local Measurements

| Path                                             | Samples |        p50 |        p95 |        p99 |
| ------------------------------------------------ | ------: | ---------: | ---------: | ---------: |
| Argon2id hash                                    |       6 | 181.339 ms | 193.491 ms | 193.491 ms |
| Argon2id verify                                  |       6 | 183.608 ms | 187.542 ms | 187.542 ms |
| Refresh orchestration without database/Redis I/O |  10,000 |       0 ms |   0.001 ms |   0.001 ms |

Security primitives:

- identity HMAC: 142,055 operations/second;
- AES-256-GCM encrypt/decrypt: 23,994 operations/second.

The authentication benchmark reported 11.936 ms event-loop p99, 193.5 MiB
heap, and 382.19 MiB RSS. The final ten-second cooperative crypto soak
completed 189,100 iterations at 18,910 operations/second, 52.265 ms event-loop
p99, 416.1 MiB RSS, and no monotonic heap growth in that run.

These microbenchmarks validate the approved password cost and local
concurrency assumptions. The refresh figure explicitly excludes network and
database latency and must not be treated as an HTTP SLO measurement.

## Load and Race Coverage

`performance/k6/auth-load.js` provides controlled login, rotating refresh,
parallel refresh-race, and repeated citizen-cache scenarios. Rate limits remain
enabled and are asserted. `performance/k6/auth-soak.js` supplies the staging
soak profile. Both reject production-looking targets and require explicit
approval for non-local targets.

Multi-instance correctness is covered by:

- database-conditional refresh generation updates;
- Redis per-session coordination;
- a k6 five-request shared-token race requiring at most one winner;
- database-unique registration idempotency and existing concurrency tests.

## Resilience Evidence

- Redis rate-limit failure fails authentication closed without retry loops.
- NIDA response timeout, bounded retry, cache, and circuit transitions have
  focused unit tests.
- Engine timeouts and maximum concurrency have focused unit tests.
- Database readiness fails independently of liveness.
- Outbox retries use bounded exponential backoff.
- Request bodies, password hashing, Engine calls, outbox delivery, cleanup
  batches, and direct uploads all have explicit bounds.

## Query Review

`npm run benchmark:query-plans` prints JSON `EXPLAIN` plans for refresh lookup,
active sessions, verification attempts, step-up target lookup, and outbox
delivery. It requires an explicitly approved disposable database branch.

Static review confirms matching unique or compound indexes for all five query
shapes. Phase 12 also replaces per-object orphan lookups with one batched
digest query and bounds mail delivery concurrency at four by default.

## Capacity Assumptions

- PostgreSQL adapter pool starts at ten connections per replica; the aggregate
  across replicas must remain below the approved Neon branch quota.
- Argon2 concurrency remains four, implying up to roughly 256 MiB of active
  Argon2 memory plus process overhead. Start Auth replicas with at least 512 MiB
  memory and verify headroom in staging.
- Engine concurrency remains four.
- Outbox delivery concurrency defaults to four.
- Operational batches default to 50.

These are starting assumptions, not production approval.

## SLOs

The machine-readable dashboard contract is
`performance/auth-slo-dashboard.json`.

- availability: 99.9%;
- login: p95 under 750 ms, p99 under 1,200 ms;
- refresh: p95 under 250 ms, p99 under 500 ms;
- citizen lookup: p95 under 2,500 ms, p99 under 6,000 ms;
- eligible server error rate: below 1%;
- no outbox dead letters.

## Exceptions Before Release

k6 is not installed in this workspace, and no approved disposable,
Phase-11-migrated database or synthetic NIDA staging stack was supplied.
Therefore the HTTP load profile, staging query plans, and 30-minute staging
soak were validated syntactically but not executed here. Their results remain
a mandatory Phase 13 release input; no SLO is claimed as achieved until those
artifacts pass in approved staging.
