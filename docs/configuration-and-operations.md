# Configuration and Operations

## Fixed Port

The service listens on port `3000`. This is a code-level service contract and
must not be made environment-dependent without a coordinated platform change.

## Current Environment

```env
APP_ENV=development
DATABASE_URL=postgresql://mucyora_auth_app:password@host/database?sslmode=require
```

Future variables must be added to `.env.example` in the same change that adds
their runtime validation.

## Required Production Controls

- validate all configuration at startup;
- reject placeholder or weak secrets;
- use platform-managed secrets;
- expose separate liveness and readiness endpoints;
- fail readiness when required dependencies are unavailable;
- emit structured logs without sensitive payloads;
- shut down gracefully and close database connections.

## Commands

```bash
npm install
npm run build
npm run test
npm run test:e2e
npm run start:dev
```

`DATABASE_MIGRATION_URL` is forbidden in this service.
