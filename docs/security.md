# Security Rules

## Credentials and Tokens

- Hash passwords with Argon2 or another approved adaptive hash.
- Store verification, reset, OTP, and refresh tokens as hashes.
- Use short-lived access tokens and bounded refresh sessions.
- Rotate/revoke sessions after password or high-risk identity changes.
- Never share administrator signing secrets.

## Endpoint Protection

- Apply Helmet, strict CORS, body-size limits, global DTO validation, and safe
  exception mapping.
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
