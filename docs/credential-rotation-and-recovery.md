# Credential Rotation and Recovery

All production values come from the deployment secret manager. Never place
secret values in manifests, tickets, chat, logs, or drill evidence.

## JWT Signing Keys

1. Generate a new RSA key in the approved KMS/HSM boundary and assign a unique
   key ID.
2. Add the old public key to
   `MUCYORA_AUTH_PREVIOUS_SIGNING_PUBLIC_KEYS_JSON`.
3. Set the new private key, public key, and key ID as the active values.
4. deploy one staging replica; confirm new tokens use the new `kid` and JWKS
   publishes both public keys.
5. Confirm a token signed by the old key remains valid and a forged or unknown
   `kid` fails.
6. Roll out remaining replicas, wait longer than the maximum access-token TTL
   plus clock skew, then remove the old public key.

At most three overlap keys are accepted. Private keys are never accepted in
the overlap ring.

## NIDA and Engine Credentials

For each provider, create a new credential before revoking the old one. Update
the secret manager version, restart one staging replica, exercise a synthetic
provider request, verify timeouts/circuit metrics and safe logs, then complete
the rollout. Revoke the old credential only after all replicas use the new
version. Roll back by restoring the previous secret-manager version while it
remains valid.

Engine keys are purpose-separated from NIDA, JWT, encryption, digest, and
internal-service keys. Rotating one must not alter any other value.

## Database Restore Exercise

1. Restore the latest encrypted backup into an isolated, access-restricted
   branch.
2. apply migrations using the database migration role from `api/db`.
3. validate migration history, row counts, critical constraints, and Auth
   readiness using synthetic/operator-safe queries.
4. connect Auth with the least-privilege runtime role and run the E2E and
   contract suites.
5. record backup timestamp, restore duration, recovery point, recovery time,
   approvers, and sanitized evidence.
6. destroy the isolated branch through the approved database procedure.

Never restore production identity data to developer machines. A restore drill
is incomplete until the runtime role is proven unable to perform DDL.
