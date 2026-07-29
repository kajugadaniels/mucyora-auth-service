# Synthetic Performance Validation

These tests must target localhost or an explicitly approved staging
environment backed by synthetic users, a synthetic citizen provider, isolated
Redis, and a disposable database branch. Production targets and real identity
data are forbidden.

Run the controlled load profile:

```bash
k6 run performance/k6/auth-load.js
```

Run a shortened local soak:

```bash
SOAK_DURATION=5m k6 run performance/k6/auth-soak.js
```

Refresh scenarios require unique synthetic refresh tokens:

```bash
REFRESH_TOKENS_JSON='["token-one","token-two"]' \
  k6 run performance/k6/auth-load.js
```

The registration race runs only when an isolated synthetic
`REGISTRATION_CHALLENGE_TOKEN` is supplied. Five parallel requests reuse one
idempotency key and must either return the same successful outcome or a safe
conflict.

An approved non-local staging target additionally requires:

```bash
BASE_URL=https://auth.staging.example \
ALLOW_APPROVED_STAGING_TARGET=true \
  k6 run performance/k6/auth-load.js
```

Rate limits remain enabled. The login and citizen scenarios accept `429` as
proof that abuse controls remain active, but k6 failure-rate thresholds still
detect unexpected responses.
