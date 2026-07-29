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

## Query Rules

- Select only fields required by the response or decision.
- Keep password/token hashes out of responses and logs.
- Use transactions for multi-record credential or session changes.
- Make token consumption and security-sensitive retries atomic.
- Add indexes through reviewed migrations before shipping new high-frequency
  access patterns.
- Never use raw SQL to bypass service ownership without review.
