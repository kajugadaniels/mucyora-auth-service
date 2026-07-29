# api/auth Git Rules

Codex must never run Git commands automatically.

Present commands for the developer to copy and run.

## Path Rule

All paths must be relative to the `api/auth` project root.

Correct:

```bash
git add "src/auth/auth.module.ts"
git commit -m "feat(auth): configure authentication module"
```

Wrong:

```bash
git add "api/auth/src/auth/auth.module.ts"
git commit -m "feat(auth): configure authentication module"
```

## Commit Rules

- One file per `git add`.
- Never use `git add .`.
- Never use `git add -A`.
- Never include `cd api/auth`.
- Never run `git push`.
- Use Conventional Commits.
- Keep one logical change per commit.

## Common Scopes

- `auth` for authentication flows, tokens, and service configuration.
- `identity` for citizen lookup and identity-verification orchestration.
- `session` for session lifecycle and refresh-token management.
- `security` for credentials, access controls, and security hardening.
- `docs` for Markdown-only documentation updates.
