# Controlled Deployment and Rollback

Deployment always requires a separate explicit operator command. The manifest
in `deploy/kubernetes/auth.yaml` is a reviewed template, not an authorization
to deploy.

## Preconditions

- CI build, unit, E2E, boundary, API-contract, dependency, secret, and container
  gates pass for the exact commit.
- The CycloneDX SBOM and immutable image digest are retained.
- No unaccepted high or critical finding exists.
- `api/db` migrations are deployed and verified before Auth consumes them.
- Secret-manager references, least-privilege IAM/database grants, TLS, private
  networking, dependency quotas, dashboards, and paging routes are approved.
- Phase 12 staging load, query-plan, and 30-minute soak exceptions are closed.

## Staged Rollout

1. Deploy the immutable digest to an isolated staging environment.
2. Run readiness, contract, synthetic registration/login/refresh, provider,
   rotation, recovery, and load/soak checks.
3. Deploy one production canary with no more than 5% traffic.
4. Observe at least one full alert window for availability, latency, errors,
   saturation, rate limits, dependency failures, refresh reuse, and dead
   letters.
5. Progress to 25%, 50%, and 100% only with Auth, platform, and security
   approval at each checkpoint.

## Automatic Stop and Rollback

Stop promotion on readiness failures, elevated eligible 5xx errors, SLO burn,
connection or memory saturation, retry amplification, provider-quota risk,
security-event anomaly, token verification failure, or dead letters.

Rollback application replicas to the last scanned digest. Database rollback is
not automatic: prefer backward-compatible forward repair and use an `api/db`
rollback only when its reviewed procedure proves data safety. Verify JWKS
overlap before application rollback so tokens issued by either release remain
verifiable.
