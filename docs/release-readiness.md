# Phase 13 Release Readiness

## Automated Gates

`npm run check:release` verifies project/database ownership, the versioned API
contract, load-script syntax, lint, build, unit tests, and E2E tests. CI also
rejects high/critical production-dependency and container findings, scans Git
history for secrets, and publishes a CycloneDX SBOM.

The approved release artifact is an immutable container digest. The runtime is
non-root, has a read-only filesystem, no service-account token, no added Linux
capabilities, explicit CPU/memory requests and limits, readiness/liveness/startup
probes, disruption protection, and bounded autoscaling.

## Required External Evidence

These controls cannot be truthfully proven by source code alone and block
production approval until an operator attaches sanitized evidence:

- Phase 12 staging load, query-plan, and 30-minute soak results;
- database restore duration and least-privilege runtime-role verification;
- JWT, NIDA, and Engine credential rotation drill records;
- cloud IAM policy and private TLS network review;
- NIDA, Engine, Redis, Neon, mail, and storage quotas;
- alert delivery and escalation test;
- independent penetration/security review and resolved findings.

## Security Review Register

No critical or high source-code finding is accepted by default. Scanner
results and penetration findings belong in the release record, not this
repository. An exception requires severity, affected asset, compensating
control, accountable owner, expiry, and security approval.

The threat model covers enumeration, credential stuffing, session/token
replay, registration races, dependency compromise, provider manipulation,
identity/biometric disclosure, supply-chain compromise, and operational
failure. Review must include authenticated and unauthenticated authorization,
SSRF, injection, mass assignment, rate-limit bypass, concurrency, cryptographic
key handling, log leakage, and business-logic abuse.

### Time-Bounded Development-Tool Exception

On July 30, 2026, the full npm audit reported GHSA-mh99-v99m-4gvg through
development-only Jest, ESLint, and Nest CLI glob tooling. The fixed
`brace-expansion` major is incompatible with those consumers and a global
override breaks lint execution. It is absent from the production dependency
graph and runtime image installation path.

- owner: Auth security maintainer;
- compensating control: CI supplies fixed repository-owned glob expressions;
  untrusted runtime input never reaches this package;
- release gate: `npm audit --omit=dev --audit-level=high` must remain clean;
- expiry: October 30, 2026, or earlier when upstream consumers accept the
  compatible patched dependency;
- closure: remove this exception only after full audit and the complete release
  suite both pass.

## Release Decision

Source implementation of Phase 13 is complete when local checks pass. The
service is only production-ready when every external-evidence item above is
closed for the exact release candidate. Deployment remains a separate,
explicitly authorized operation.
