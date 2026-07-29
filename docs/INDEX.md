# Authentication Service Documentation

This directory is the operational and engineering reference for `api/auth`.

## Reading Order

1. [Architecture and boundaries](architecture-and-boundaries.md)
2. [Configuration and operations](configuration-and-operations.md)
3. [Database access](database-access.md)
4. [Security](security.md)
5. [Development rules](development-rules.md)
6. [Git rules](git.md)
7. [Root security policy](../SECURITY.md)
8. [Identity data protection](identity-data-protection.md)
9. [Authentication security events](security-events.md)
10. [Citizen provider integration](citizen-provider-integration.md)
11. [Citizen lookup and registration challenges](registration-challenges.md)
12. [Registration and email verification](registration-and-email-verification.md)
13. [Authentication and sessions](authentication-and-sessions.md)
14. [Password lifecycle](password-lifecycle.md)
15. [Account identity verification](identity-verification.md)
16. [Step-up identity verification](step-up-verification.md)
17. [Operational jobs](operational-jobs.md)

## Implementation Planning

- [Current-state audit](current-state-audit.md)
- [Reference parity matrix](reference-parity-matrix.md)
- [Authentication database change proposal](database-change-proposal.md)

## Documentation Rules

- Describe implemented behavior separately from planned behavior.
- Update configuration documentation with every environment-variable change.
- Update database documentation with every query or table-access change.
- Update security documentation with every credential, token, identity, or
  internal-service contract change.
- Never include real credentials, tokens, identity values, or connection
  strings.
