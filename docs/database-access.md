# Database Access

## Ownership

`api/db` owns `prisma/schema.prisma`, migrations, generation, and deployment.
This service consumes `@mucyora/db` and must not contain local Prisma ownership
files or migration commands.

## Runtime Role

Use `mucyora_auth_app` with only the privileges needed for:

- users and user preferences;
- citizen identities and platform IDs;
- email verification and password reset tokens;
- refresh tokens;
- identity-verification attempts;
- security event logs.

Production startup rejects database URLs whose username is not
`mucyora_auth_app`.

## Integration

`DatabaseService` extends the generated client exported by `@mucyora/db` and
disconnects during application shutdown. Connection is lazy so the process can
serve liveness while PostgreSQL is temporarily unavailable. It exposes a
minimal `SELECT 1` readiness check that establishes or verifies connectivity.

The readiness result is cached by the health service. Liveness never injects or
calls the database.

## Query Rules

- Select only fields required by the response or decision.
- Keep password/token hashes out of responses and logs.
- Use transactions for multi-record credential or session changes.
- Make token consumption and security-sensitive retries atomic.
- Add indexes through reviewed migrations before shipping new high-frequency
  access patterns.
- Never use raw SQL to bypass service ownership without review.

The single raw readiness query is the only Phase 1 exception and does not read
application tables or user data.
