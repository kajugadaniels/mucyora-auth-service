# Auth Incident Response Runbook

## Triage

Page the Auth on-call and security owner for suspected key, token, credential,
identity, biometric, database, or provider compromise. Record UTC time,
affected environment, stable alert codes, correlation IDs, and the incident
commander. Do not copy sensitive payloads into the incident channel.

## Containment

- Signing-key exposure: introduce a new active key, preserve only uncompromised
  overlap public keys, revoke affected sessions, and notify token consumers.
- Refresh-token compromise: revoke the affected session family; use logout-all
  only when evidence shows account-wide exposure.
- NIDA, Engine, mail, Redis, database, or object-storage credential exposure:
  disable/revoke the credential through its provider, rotate via the secret
  manager, restrict network access, and verify safe failure behavior.
- Identity or biometric disclosure: block further processing, preserve audit
  and legal-hold evidence, and engage privacy/legal response.
- Availability incident: remove unready replicas, stop retry amplification,
  protect dependency quotas, and retain liveness for diagnosis.

## Investigation and Recovery

Preserve immutable CI, deployment, security-event, provider, and access logs.
Use correlation IDs and minimized event codes; never query or export more
identity data than the investigation requires. Recover using a previously
scanned image digest and the staged rollback procedure. Confirm readiness,
authentication, refresh rotation, JWKS, dependency health, outbox backlog,
error rate, and latency before restoring traffic.

## Closure

Document scope, root cause, timeline, credentials and sessions rotated,
notifications, recovery-point/recovery-time results, residual risk, and
follow-up owners. Security approves closure. Evidence retention and deletion
must respect legal holds and the documented retention policy.
