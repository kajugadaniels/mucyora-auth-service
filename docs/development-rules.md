# Development Rules

## Code

- Use strict TypeScript and explicit DTOs.
- Do not use `any`.
- Keep controllers thin and business rules in services.
- Validate all external input with `class-validator`.
- Use dependency injection for providers and clocks that require testing.
- Delete dead code instead of commenting it out.

## Tests

Add unit tests for credential, token, session, rate-limit, and identity state
transitions. Add e2e tests for authentication guards, validation, safe errors,
and critical recovery flows. Mock email, storage, and engine integrations.

Run:

```bash
npm run build
npm run test
npm run test:e2e
```

## Documentation

Update README and `docs/` with every public contract, boundary, configuration,
database-access, or security change.

## Git

- Codex must not run Git commands automatically.
- Use one quoted file per `git add`.
- Never use `git add .`, `git add -A`, or `git push`.
- Use Conventional Commits with scopes such as `auth`, `security`, `database`,
  `config`, `test`, and `docs`.
