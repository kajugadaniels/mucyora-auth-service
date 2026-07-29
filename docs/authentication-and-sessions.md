# Authentication and Sessions

## Phase 6 Scope

Phase 6 implements login, limited/full session issuance, RS256 access tokens,
opaque refresh rotation, refresh reuse detection, logout, session listing, and
owned-session revocation. Identity-verification submission and
limited-to-full session upgrade remain later phases.

## Login

```text
POST /api/v1/auth/login
```

Login accepts normalized email, password, device identifier, optional device
label, and an explicit `COOKIE` or `NATIVE` transport.

- Unknown email and wrong password return the same error.
- Unknown accounts still perform Argon2 verification against a synthetic hash.
- Redis limits requests independently by keyed IP, email, and device digests.
- Repeated failures increment bounded credential state and may temporarily
  lock password verification.
- Unverified email returns the safe `EMAIL_VERIFICATION_REQUIRED` next step
  only after valid credentials.
- Disabled, suspended, and locked accounts receive generic credential errors.

An email-verified user without completed identity verification receives a
`LIMITED` session. A verified identity receives `FULL`.

## Access Tokens and JWKS

Access tokens use RS256 and contain only:

- issuer and approved audiences;
- user, session, and token identifiers;
- session level;
- email/identity verification booleans;
- token type and timestamps.

They never contain email, NID, birth date, provider data, profile data, or a
permissions snapshot. Protected routes verify the signature and then confirm
the indexed database session remains active, unexpired, owned by the subject,
and at the claimed level.

Public verification material is available at:

```text
GET /.well-known/jwks.json
```

It exposes only the RSA public key and uses a five-minute public cache policy.

## Refresh Rotation

```text
POST /api/v1/auth/refresh
```

Refresh tokens are random opaque values; only keyed digests are stored. Every
successful refresh transaction:

1. confirms the session is still active;
2. creates the next unique session generation;
3. conditionally consumes the current token;
4. links it to the replacement;
5. updates session activity/version;
6. writes a security event.

A Redis per-session lock coordinates replicas. A parallel replay inside the
short grace period receives a conflict and does not falsely compromise the
family. Reuse outside that period marks the session `COMPROMISED`, revokes all
family refresh tokens, records reuse on the presented token, and writes a
high-severity event.

## Browser and Native Transport

`COOKIE` mode stores refresh tokens in a scoped `HttpOnly` cookie. A separate
readable CSRF cookie must match the `x-csrf-token` header and the server-derived
HMAC binding for that refresh token. Production requires secure cookies.

`NATIVE` mode returns the refresh token in JSON only when explicitly requested.
Native applications must place it in secure platform storage.

Access tokens remain response values intended for memory, not persistent
browser storage.

## Session Management

Authenticated limited and full sessions may use:

```text
POST   /api/v1/auth/logout
POST   /api/v1/auth/logout-all
GET    /api/v1/auth/sessions
DELETE /api/v1/auth/sessions/:sessionId
```

Revocation updates the session and all associated refresh digests atomically.
Session listing is bounded and returns only owned device/session metadata.
Limited sessions cannot pass routes decorated as requiring a full session.
