# Citizen Provider Integration

## Scope

Phase 3 implements a private NIDA citizen-identity adapter. It does not expose
an HTTP endpoint, create registration challenges, register users, or persist
provider records in PostgreSQL.

The adapter accepts a normalized Rwanda NID from a future domain workflow and
returns only this minimized contract:

- provider reference, when supplied;
- nationality;
- surname and given names;
- ISO date of birth;
- sex;
- document status;
- portrait reference, when supplied;
- provider source-update timestamp, when supplied.

The provider's NID and unrecognized response properties are discarded.

## Outbound Request

The provider base URL is fixed at startup. Runtime input cannot select a host,
redirects are disabled, production requires HTTPS, and certificate validation
remains enabled. The shared Axios client uses keep-alive agents and bounded
response timeouts. Basic-auth credentials come only from validated secret
configuration.

The request uses the provider's established body contract:

```json
{
  "documentType": "NID",
  "documentNumber": "<normalized NID>",
  "fosaid": "<configured facility identifier>"
}
```

Do not log this request body or the provider response.

## Resilience

- Only timeouts, selected network failures, HTTP `429`, and HTTP `5xx`
  responses are retried.
- Retry count is bounded to three retries and uses bounded exponential
  backoff.
- Not-found and other non-retryable client responses are not retried.
- A circuit breaker opens after the configured consecutive-failure threshold.
- After the reset interval, only one half-open recovery probe is admitted.
- Concurrent lookups for the same HMAC digest share one in-flight request
  inside a service replica.

## Distributed Positive Cache

Successful minimized results are cached in Redis for a configurable TTL,
defaulting to five minutes. Not-found responses are not cached.

Cache keys contain a versioned HMAC lookup digest, never a plaintext NID or
plain SHA-256 digest. Cache values are AES-256-GCM encrypted for the
`citizen-snapshot` purpose. Unreadable entries are ignored and scheduled for
deletion. Redis failure degrades to a provider lookup and does not change the
result of a successful provider request.

## Observability

Metrics are emitted as structured operation events containing an outcome,
duration, optional retry attempt, and correlation ID. They must never include:

- NIDs or derived cache keys;
- provider credentials;
- outbound request bodies;
- raw provider payloads;
- Axios configuration or upstream diagnostic messages.

## Test Boundary

Tests use mocked provider and Redis clients. They verify normalization,
response minimization, timeout and retry behavior, circuit transitions,
encrypted positive caching, safe cache keys, and concurrent request
coalescing. Tests must never call the real provider or a production Redis
deployment.
