# Security Rules

## Credentials and Tokens

- Hash passwords with Argon2 or another approved adaptive hash.
- Store verification, reset, OTP, and refresh tokens as hashes.
- Use short-lived access tokens and bounded refresh sessions.
- Rotate/revoke sessions after password or high-risk identity changes.
- Never share administrator signing secrets.

## Endpoint Protection

- Helmet, strict allowlisted CORS, a 256 KiB body limit, global DTO validation,
  and safe exception mapping are configured globally.
- Wildcard origins are rejected and unknown DTO properties are forbidden.
- Production Swagger is disabled by default and protected when enabled.
- Correlation IDs are constrained before being reflected to callers.
- Rate-limit login, registration, OTP, recovery, and identity verification.
- Prevent account enumeration through response text and timing.
- Require authenticated internal credentials for calls to `api/engine`.

## Sensitive Data

Never log passwords, raw tokens, NID/PID plaintext, encryption keys, biometric
media, S3 object contents, or full provider payloads. Store only the minimum
identity evidence required by policy.

## Audit

Record login outcomes, verification outcomes, password changes, session
revocation, token reuse, and rate-limit events without sensitive payloads.

Structured JSON application logs are implemented, but durable authentication
security events are deferred until the Phase 2 database contract exists.
