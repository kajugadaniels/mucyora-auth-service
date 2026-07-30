# Advanced Auth Hardening: Improvements 8–14

## Dependency Readiness

Liveness remains dependency-free. Readiness checks PostgreSQL and Redis in
parallel, caches the minimized result, and fails traffic admission when either
required dependency is unavailable. Redis may be disabled only in tests;
production startup rejects that configuration.

## Managed JWT Signing

`MUCYORA_AUTH_SIGNING_PROVIDER` selects `SOFTWARE_PEM` or `AWS_KMS`. KMS mode
keeps private key material outside the process and uses
`RSASSA_PKCS1_V1_5_SHA_256`. The configured public key and overlap public keys
remain the JWKS verification ring. The workload IAM role needs only `kms:Sign`
on the selected key.

## OpenTelemetry

`OTEL_ENABLED=true` activates Node HTTP, NestJS, database-client, Redis, and
outbound dependency instrumentation through the standard OTLP environment
contract. Production requires an HTTPS collector endpoint. Telemetry must not
capture request bodies, authentication headers, cookies, NIDs, tokens, or
biometric references.

## Risk-Based Sessions

Login compares a bounded history of device IDs and keyed IP/user-agent
contexts. A known context remains low risk. A new device or changed context
creates a limited session that must complete the existing identity-verification
upgrade flow before receiving full access.

## Passkeys and Recovery Codes

Authenticated users may register, list, and revoke WebAuthn passkeys.
Challenges are single-use Redis values with bounded expiry; verification
requires the configured RP ID, exact HTTPS origins, and user verification.
Only credential public keys, counters, device metadata, and labels are stored.

Recovery-code rotation revokes all previous unused codes. Only keyed digests
are stored. A code is consumed atomically once and produces a short-lived token
for the existing password-reset flow.

## Compromised Password Screening

When enabled, Auth hashes the candidate locally with SHA-1 and sends only the
first five hexadecimal characters to the fixed HTTPS range API. Padded
responses, strict timeouts, no retries, and fail-closed behavior reduce
disclosure and retry amplification. Plaintext passwords and complete hashes
never leave Auth.

## Release Exercises

`npm run release:evidence:check` validates the operator-supplied evidence
manifest. It requires staging load/soak, query plans, restore, three credential
rotation drills, IAM, TLS/private networking, alert delivery, and independent
penetration review to pass for one immutable image digest. This check does not
perform or fabricate those external exercises.
