# Auth Threat Model

## Scope and Assets

This model covers the public Auth HTTP boundary, internal step-up and operations
routes, PostgreSQL, Redis, NIDA, Engine, mail, verification storage, deployment
configuration, and CI supply chain. Protected assets are credentials, signing
and encryption keys, sessions, identity attributes, biometric references,
security events, and account state.

Administrators, user profiles, payment state, and document-signing private keys
are outside Auth ownership. Their services must validate Auth tokens against
the published JWKS and enforce their own authorization.

## Trust Boundaries and Threats

| Boundary                  | Principal threats                                                         | Required controls                                                                                           | Residual risk                                   |
| ------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Internet to Auth          | enumeration, credential stuffing, injection, oversized input, token theft | DTO allowlisting, generic denials, distributed limits, body limit, Helmet, strict CORS, TLS                 | distributed low-rate abuse requires monitoring  |
| Auth to PostgreSQL        | credential theft, privilege escalation, destructive query                 | `mucyora_auth_app`, TLS/private path, no DDL, bounded indexed queries, transactions                         | provider or operator compromise                 |
| Auth to Redis             | bypassed rate limits, replay races, cache disclosure                      | TLS/private path, ACL, purpose-prefixed keys, encrypted positive cache, fail-closed authentication controls | availability loss degrades protected operations |
| Auth to NIDA              | credential disclosure, SSRF, malicious response, outage                   | fixed HTTPS origin, no redirects, schema minimization, timeout/retry/circuit, secret manager                | provider correctness and availability           |
| Auth to Engine/S3         | biometric disclosure, spoofing, replay, object substitution               | HMAC request authentication, nonce replay protection, checksum-bound private uploads, attempt binding       | cloud/provider compromise                       |
| Auth to mail              | token disclosure, duplicate delivery                                      | encrypted outbox envelopes, stable idempotency, bounded retries and leases                                  | recipient mailbox compromise                    |
| Auth to internal services | assertion theft, confused deputy, replay                                  | purpose-separated credentials and one-time target-bound assertions                                          | compromised authorized service                  |
| Build to runtime          | dependency compromise, leaked secret, mutable artifact                    | locked installs, audit, secret scan, SBOM, image scan, digest deployment                                    | scanner coverage and zero-day risk              |

## Abuse Cases

- An unknown-account login performs the same password verification class and
  returns the same denial as a wrong password.
- A stolen refresh token cannot win more than one generation transition.
  Detected reuse compromises only its session family.
- Registration and step-up requests use conditional writes and idempotency so
  concurrent replicas cannot create multiple successful outcomes.
- A forged NIDA, Engine, mail, or storage response is rejected by transport,
  schema, origin, signature, checksum, or attempt-binding controls.
- A database or Redis outage does not make liveness fail; readiness and
  security-sensitive operations fail safely.
- Logs and metrics use stable codes and route templates and exclude bodies,
  secrets, identity values, tokens, and private object references.

## Review Rules

Security review is required for new endpoints, trust boundaries, identity
fields, token claims, cryptographic algorithms, external destinations, runtime
permissions, or high-frequency database queries. Critical or high findings
block release unless the security owner records a time-bounded exception,
compensating control, owner, and expiry.
