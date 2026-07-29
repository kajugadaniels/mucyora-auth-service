# OpenAPI and API Versioning

## Published Documentation

Swagger UI is disabled by default. Set `ENABLE_SWAGGER=true` only in an
approved environment:

- UI: `/api/docs`;
- OpenAPI JSON: `/api/docs-json`;
- committed release contract: `contracts/openapi.json`.

Production Swagger additionally requires Basic authentication. The document
describes bearer JWTs, browser refresh cookies, double-submit CSRF, and the two
internal-service headers as separate security schemes.

Every example is fictional test data. Person names are Rwandan, phone examples
use Rwanda country code `+250`, and identity examples are synthetic 16-digit
values. Documentation must never contain a real citizen's NID, telephone
number, email, token, biometric reference, or provider response.

## Version Policy

The current contract is `1.0.0` and public/internal business routes use the
`/api/v1` prefix. Liveness, readiness, and JWKS remain stable unversioned
infrastructure routes.

- backward-compatible descriptions, examples, and optional fields increment
  the OpenAPI patch version;
- backward-compatible endpoint or optional capability additions increment the
  minor version;
- removed/renamed fields, changed meanings, stricter accepted values, or
  incompatible security behavior require a new URL major version.

Deprecated operations remain documented with `deprecated: true`, a replacement
route, an announced removal release, and an observation window. No v1 operation
is currently deprecated. Compatibility removal follows
`docs/compatibility-removal-plan.md`.

## Drift Gate

Run:

```bash
npm run openapi:generate
npm run openapi:check
```

CI regenerates metadata in memory and rejects a stale committed artifact.
Contract tests require operation IDs, summaries, 2xx and standard error
responses, security schemes, version/deprecation metadata, and fictional
Rwanda-specific examples.
