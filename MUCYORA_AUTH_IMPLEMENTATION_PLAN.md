# MUCYORA Auth Service
## Security-First, High-Performance Implementation Specification

**Target project:** `mucyora/api/auth`  
**Reference implementation:** `https://github.com/kajugadaniels/gracon-user-auth-service`  
**Primary external identity source:** NIDA through `CITIZEN_API_URL`  
**Biometric verification component:** `mucyora/engine`  
**Shared database package:** `@mucyora/db` from `../db`  
**Runtime database role:** `mucyora_auth_app`  
**Target runtime:** Node.js 22, NestJS 11, TypeScript strict mode  
**Document status:** Implementation specification for Codex  
**Execution policy:** Command-gated, one phase at a time  

---

# 1. Purpose

This document defines how to build the MUCYORA authentication and identity-verification service
using the proven behavior of `gracon-user-auth-service`, while adapting it to the MUCYORA
architecture and strengthening security, privacy, reliability, and performance.

The implementation must preserve the important workflows from the reference project:

- NIDA citizen lookup through `CITIZEN_API_URL`;
- registration using a valid Rwanda National ID;
- encrypted and searchable identity identifiers;
- atomic user registration;
- email verification;
- secure login;
- limited and full authentication sessions;
- refresh-token rotation and replay detection;
- session upgrade after identity verification;
- password reset and password change;
- identity-document and live-face verification;
- private temporary verification media;
- controlled calls to `mucyora/engine`;
- verification attempt limits;
- audit and security events;
- rate limiting;
- cleanup and recovery jobs.

This is **functional parity with deliberate hardening**, not a blind copy of the old source code.

The MUCYORA service must retain the useful workflows while removing legacy Gracon assumptions,
obsolete service dependencies, insecure cryptographic choices, and responsibilities that belong
to other MUCYORA services.

---

# 2. Mandatory Codex Execution Protocol

Codex must follow this section exactly.

## 2.1 Command-gated implementation

Codex must **not** implement this entire document automatically.

Codex may implement a phase only after receiving an explicit command such as:

```text
Implement Phase 1 only from MUCYORA_AUTH_IMPLEMENTATION_PLAN.md.
```

A command for one phase does not authorize the next phase.

At the end of every phase, Codex must stop and wait for another explicit command.

## 2.2 Required behavior before each phase

Before modifying code, Codex must:

1. read this complete document;
2. inspect the current `mucyora/api/auth` repository;
3. inspect relevant interfaces exported by `mucyora/api/db`;
4. inspect only the MUCYORA sibling services needed for the requested phase;
5. compare the current state with the requested phase;
6. identify existing code that can be preserved;
7. identify database changes that must be made in `api/db`;
8. present a concise phase execution plan;
9. implement only the authorized phase.

Codex must not ask for approval again after the phase has already been explicitly authorized,
unless a destructive, irreversible, or security-sensitive decision cannot be safely inferred.

## 2.3 Required behavior after each phase

At the end of each phase, Codex must provide:

- phase completed;
- files created;
- files modified;
- files removed;
- database changes required or consumed;
- API contracts added or changed;
- security controls implemented;
- performance controls implemented;
- tests added;
- commands executed;
- test and build results;
- unresolved risks;
- deferred work;
- exact confirmation that no later phase was implemented.

Required final sentence:

```text
Phase <number> is complete. No later phase was implemented. Waiting for the next explicit command.
```

## 2.4 Prohibited autonomous actions

Without an explicit command, Codex must not:

- start another phase;
- create or apply database migrations;
- modify `api/db`;
- push commits;
- open pull requests;
- deploy services;
- rotate production secrets;
- call real NIDA, email, AWS, or biometric production systems;
- delete existing production-compatible behavior;
- change public API contracts outside the requested phase;
- add unrelated features;
- move profile, device, agreement, payment, or admin functionality into Auth.

## 2.5 Git and migration safety

Codex must never:

- force-push;
- rewrite shared branch history;
- delete applied migrations;
- use `prisma db push` on a shared database;
- put a Prisma schema or migrations inside `api/auth`;
- commit `.env` files or credentials;
- silently change encryption formats;
- silently invalidate active sessions;
- silently invalidate historical verification evidence.

---

# 3. Executive Architecture Decision

The target service is:

```text
mucyora/api/auth
```

It is responsible for authentication, account registration, NIDA identity resolution, credential
management, session management, and identity-verification orchestration.

It is not a general user-management service.

## 3.1 Auth owns

- registration;
- NIDA citizen lookup;
- identity-number normalization;
- identity uniqueness enforcement;
- identity encryption and keyed lookup;
- user credentials;
- email verification;
- login;
- access-token issuance;
- refresh-token issuance and rotation;
- session revocation;
- password recovery;
- password change;
- verified-account state;
- biometric verification orchestration;
- calls to `mucyora/engine`;
- temporary identity-verification media lifecycle;
- authentication security events;
- authentication-related consent;
- step-up identity challenges;
- JWKS or equivalent access-token verification material.

## 3.2 Auth does not own

- user profile editing;
- profile photos;
- user preferences;
- user activity history unrelated to authentication;
- devices or IMEIs;
- device ownership;
- ownership transfers;
- agreements or document editing;
- signatures or certificates;
- payments;
- admin authentication and permissions;
- Prisma schema or migrations;
- face-comparison implementation;
- final manual-review decisions.

These belong to:

```text
api/user       profiles, devices, IMEIs, ownership, transfers, agreements
api/signature  signing keys, certificates, cryptographic signatures
api/admin      administrators, reviews, disputes, privileged operations
api/db         schema, migrations, generated client, database constraints
engine         biometric comparison and liveness evidence
```

---

# 4. Reference-Service Parity and MUCYORA Decisions

| Reference capability | MUCYORA requirement | Decision |
|---|---|---|
| NIDA citizen lookup | Required | Retain and harden |
| `CITIZEN_API_URL` | Required | Retain |
| NIDA Basic credentials | Provider dependent | Server-side only |
| FIN/Foreign Identity Service | Not requested | Remove |
| Registration using document number | Required | NIDA only for initial release |
| Email uniqueness | Required | Retain |
| Identity uniqueness | Required | Use versioned HMAC, not plain hash |
| AES-encrypted identity number | Required | Use AES-GCM/KMS envelope encryption |
| Platform-generated user ID | Optional | Retain only if business requires it |
| Atomic registration | Required | Retain |
| Verification email | Required | Retain and harden |
| Limited session | Required | Retain |
| Full session | Required | Retain |
| Refresh-token rotation | Required | Retain and strengthen |
| Refresh-token reuse detection | Required | Retain |
| Process-local refresh single-flight | Insufficient horizontally | Replace with distributed/database-safe control |
| Password reset | Required | Retain |
| Password change | Required | Retain |
| ID card plus selfie submission | Required | Retain as a workflow |
| Still-selfie “liveness” | Insufficient | Replace with real liveness evidence |
| Engine integration | Required | Retain using MUCYORA contract |
| Private S3 media | Required | Retain and harden |
| Three attempts per window | Required baseline | Make configurable and risk-aware |
| Security audit events | Required | Retain and expand |
| Profile/preferences endpoints | Belong to `api/user` | Exclude from Auth |
| Direct Prisma ownership | Forbidden | Consume `@mucyora/db` only |

---

# 5. Target Project Structure

```text
mucyora/api/auth/
├── .github/
│   └── workflows/
│       └── api-security.yml
├── docs/
│   ├── INDEX.md
│   ├── architecture.md
│   ├── authentication-model.md
│   ├── citizen-api.md
│   ├── identity-data-protection.md
│   ├── identity-verification.md
│   ├── session-management.md
│   ├── rate-limits.md
│   ├── security-events.md
│   ├── operations.md
│   └── threat-model.md
├── scripts/
│   └── assert-project-boundary.mjs
├── src/
│   ├── common/
│   │   ├── constants/
│   │   ├── decorators/
│   │   ├── errors/
│   │   ├── filters/
│   │   ├── guards/
│   │   ├── interceptors/
│   │   ├── middleware/
│   │   ├── pipes/
│   │   ├── types/
│   │   └── utils/
│   ├── config/
│   │   ├── app.config.ts
│   │   ├── auth.config.ts
│   │   ├── citizen.config.ts
│   │   ├── database.config.ts
│   │   ├── engine.config.ts
│   │   ├── mail.config.ts
│   │   ├── object-storage.config.ts
│   │   ├── rate-limit.config.ts
│   │   └── validation.schema.ts
│   ├── integrations/
│   │   ├── citizen-api/
│   │   ├── engine/
│   │   ├── mail/
│   │   ├── object-storage/
│   │   └── cache/
│   ├── modules/
│   │   ├── accounts/
│   │   ├── authentication/
│   │   ├── registration/
│   │   ├── email-verification/
│   │   ├── passwords/
│   │   ├── sessions/
│   │   ├── identity-verification/
│   │   ├── step-up-verification/
│   │   ├── security-events/
│   │   ├── internal/
│   │   └── health/
│   ├── app.module.ts
│   └── main.ts
├── test/
│   ├── contract/
│   ├── e2e/
│   ├── integration/
│   ├── security/
│   └── unit/
├── .env.example
├── Dockerfile
├── package.json
├── SECURITY.md
└── README.md
```

No directory under this service may contain:

```text
prisma/schema.prisma
prisma/migrations
prisma.config.ts
src/generated/prisma
```

---

# 6. Required Technology Baseline

## 6.1 Runtime

- Node.js 22;
- NestJS 11;
- TypeScript strict mode;
- npm;
- `@mucyora/db` using `file:../db`;
- PostgreSQL through the shared database client;
- Redis-compatible distributed cache and rate-limit storage;
- private S3-compatible object storage;
- structured JSON logging;
- OpenTelemetry-compatible tracing and metrics.

## 6.2 Recommended libraries

Use only after confirming compatibility with the existing project:

```text
@nestjs/config
@nestjs/jwt
@nestjs/passport
@nestjs/throttler
@nestjs/swagger
@nestjs/axios
@nestjs/cache-manager
@nestjs/schedule
passport
passport-jwt
argon2
class-validator
class-transformer
helmet
joi
cookie-parser
ioredis or approved Redis adapter
@aws-sdk/client-s3
@aws-sdk/s3-request-presigner
@aws-sdk/lib-storage
```

Do not install Prisma directly.

## 6.3 Password algorithm

Use **Argon2id** for new password hashes.

A controlled migration reader may verify existing bcrypt hashes and upgrade them to Argon2id after
a successful login.

Do not rehash a password before verifying it.

## 6.4 Token signing

Prefer an asymmetric signing profile:

```text
Algorithm: EdDSA or approved RSA profile
Private key: Auth Service only
Public verification: JWKS
Issuer: MUCYORA auth issuer
Audience: service-specific
```

Do not share one symmetric JWT secret across all services.

---

# 7. Database Contract

All schema changes belong in `mucyora/api/db`.

Codex working inside Auth must create a database-change proposal when a required table, field,
index, or constraint does not exist. It must not create a local Prisma schema.

## 7.1 Required durable entities

The final shared schema should support equivalents of:

### User

```text
id
email
emailNormalized
emailVerifiedAt
accountStatus
identityVerificationStatus
identityVerifiedAt
createdAt
updatedAt
version
```

### UserCredential

```text
id
userId
passwordHash
passwordAlgorithm
passwordChangedAt
failedLoginCount
lockedUntil
createdAt
updatedAt
```

### UserIdentity

```text
id
userId
identityType
encryptedIdentifier
identifierLookupDigest
maskedIdentifier
encryptionVersion
lookupKeyVersion
source
sourceReference
verifiedAt
createdAt
```

For the first MUCYORA release:

```text
identityType = RWANDA_NID
source = NIDA
```

### RegistrationChallenge

```text
id
identityLookupDigest
emailNormalized
status
citizenSnapshotEncrypted
citizenSnapshotDigest
expiresAt
consumedAt
attemptCount
createdIpHash
createdAt
```

### EmailVerificationToken

```text
id
userId
tokenDigest
expiresAt
usedAt
supersededAt
createdAt
```

### PasswordResetRequest

```text
id
userId
tokenDigest
expiresAt
usedAt
revokedAt
requestedIpHash
createdAt
```

### AuthSession

```text
id
userId
sessionFamilyId
sessionLevel
status
deviceId
deviceLabel
ipHash
userAgentHash
createdAt
lastUsedAt
expiresAt
revokedAt
revocationReason
version
```

### RefreshToken

```text
id
sessionId
tokenDigest
generation
issuedAt
expiresAt
usedAt
revokedAt
replacedByTokenId
reuseDetectedAt
```

### IdentityVerificationAttempt

```text
id
userId
purpose
status
policyVersion
engineRequestId
livenessSessionId
documentBindingVerified
faceSimilarity
livenessConfidence
compositeScore
reasonCode
attemptNumber
startedAt
completedAt
retryAfter
ipHash
userAgentHash
```

### VerificationMedia

```text
id
verificationAttemptId
mediaType
objectKeyEncryptedOrOpaqueReference
objectVersion
checksum
contentType
sizeBytes
expiresAt
deletedAt
createdAt
```

### UserConsent

```text
id
userId
consentType
policyVersion
grantedAt
revokedAt
evidence
```

### SecurityEvent

```text
id
userId
sessionId
eventType
severity
outcome
reasonCode
correlationId
ipHash
userAgentHash
safeMetadata
createdAt
```

### IdempotencyRecord

```text
id
scope
key
requestDigest
responseReference
status
expiresAt
createdAt
```

### OutboxEvent

```text
id
aggregateType
aggregateId
eventType
payload
createdAt
publishedAt
attemptCount
lastError
```

## 7.2 Required constraints and indexes

At minimum:

- unique normalized email;
- unique active NIDA lookup digest;
- unique token digests;
- unique session-family generation;
- one successful consumption per email/reset token;
- one successful result per idempotency key and request digest;
- partial index for active sessions;
- index for pending email verification;
- index for pending verification attempts;
- index for expired media cleanup;
- index for unpublished outbox events;
- optimistic version fields on session-sensitive records.

## 7.3 Sensitive identifier lookup

Do not use ordinary SHA-256 alone for NID uniqueness.

A Rwanda NID is structured and potentially enumerable. Use a versioned keyed digest:

```text
HMAC-SHA-256(normalizedNid, identifierLookupKey)
```

Store separately:

```text
encrypted value
lookup digest
masked display value
encryption version
lookup-key version
```

Encrypt the NID with AES-256-GCM through envelope encryption or KMS.

---

# 8. NIDA Citizen API Integration

## 8.1 Configuration

Required variables:

```env
CITIZEN_API_URL=
CITIZEN_API_USERNAME=
CITIZEN_API_PASSWORD=
CITIZEN_API_CONNECT_TIMEOUT_MS=3000
CITIZEN_API_RESPONSE_TIMEOUT_MS=10000
CITIZEN_API_MAX_RETRIES=2
CITIZEN_CACHE_TTL_SECONDS=300
```

Credentials are server-side secrets and must never be sent to the frontend.

## 8.2 Adapter boundary

Create a dedicated adapter:

```text
src/integrations/citizen-api/
```

The application layer must depend on an interface, not directly on Axios or provider-specific
response shapes.

Example interface:

```ts
export interface CitizenIdentityProvider {
  findCitizenByNid(
    normalizedNid: string,
    context: CitizenLookupContext,
  ): Promise<CitizenIdentityResult>;
}
```

## 8.3 Input requirements

- accept NID as a string;
- normalize whitespace and allowed separators;
- canonical form must be exactly 16 digits;
- reject unexpected characters;
- do not convert to JavaScript `number`;
- do not log the raw value;
- derive an HMAC lookup key for caching and rate limiting.

## 8.4 Provider authentication

When NIDA requires Basic Authentication:

- build the Authorization header only inside the provider adapter;
- retrieve username/password from a secret manager;
- use TLS verification;
- never log the header;
- never include provider credentials in exceptions;
- rotate credentials independently of the application.

## 8.5 Response minimization

Map the provider response to a MUCYORA-owned type.

Retain only fields needed for registration and future identity verification, such as:

```text
providerReference
nationality
surname
givenNames
dateOfBirth
sex
documentStatus
portraitReference or approved portrait evidence
sourceUpdatedAt
```

Do not return the complete NIDA payload to the client.

Do not persist undocumented fields “just in case.”

## 8.6 Caching

Use distributed cache, not process memory, in horizontally scaled environments.

Cache key:

```text
citizen:nida:v<lookup-key-version>:<nid-hmac>
```

Rules:

- default positive cache: 5 minutes;
- short or no negative cache for not-found/transient errors;
- no raw NID in keys;
- encrypt highly sensitive cached payloads when supported;
- do not allow cache data to bypass registration challenge expiry;
- cache invalidation must be possible.

## 8.7 Resilience

Use:

- connection timeout;
- total response timeout;
- bounded retry for connection resets, selected `429`, and selected `5xx`;
- no automatic retry for invalid credentials or ordinary `4xx`;
- exponential backoff with jitter;
- circuit breaker;
- connection pooling and HTTP keep-alive;
- separate provider-unavailable response;
- metrics for latency, timeout, error class, and circuit state.

## 8.8 Enumeration protection

The NIDA lookup endpoint is high risk.

Apply limits by:

- IP;
- device fingerprint or client instance;
- NID HMAC;
- account when authenticated;
- network risk category.

Return generic external responses when necessary.

Do not reveal whether an identity is already registered before the requester has completed the
appropriate protected workflow.

---

# 9. Target API Contract

All endpoints are versioned under:

```text
/api/v1
```

The exact paths may be kept compatible with the reference frontend during migration, but the
target MUCYORA contract is defined below.

## 9.1 Health

```text
GET /health/live
GET /health/ready
```

`live` must not call NIDA, Redis, S3, mail, or Engine.

`ready` may use cached dependency checks.

## 9.2 Registration and citizen lookup

```text
POST /api/v1/registration/citizen/lookup
POST /api/v1/registration
POST /api/v1/registration/email/verify
POST /api/v1/registration/email/resend
```

Compatibility aliases may temporarily support:

```text
POST /api/v1/citizen/lookup
POST /api/v1/users/register
GET  /api/v1/users/verify-email
POST /api/v1/users/resend-verification
```

Do not keep duplicate contracts indefinitely.

## 9.3 Authentication

```text
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/session/upgrade
POST /api/v1/auth/logout
POST /api/v1/auth/logout-all
GET  /api/v1/auth/sessions
DELETE /api/v1/auth/sessions/:sessionId
```

## 9.4 Passwords

```text
POST /api/v1/passwords/forgot
POST /api/v1/passwords/reset
POST /api/v1/passwords/change
```

## 9.5 Identity verification

```text
POST /api/v1/identity-verification/attempts
POST /api/v1/identity-verification/attempts/:attemptId/media
POST /api/v1/identity-verification/attempts/:attemptId/submit
GET  /api/v1/identity-verification/status
GET  /api/v1/identity-verification/attempts/:attemptId
```

For direct-to-object-storage upload, replace the media endpoint with a protected upload-policy
endpoint.

## 9.6 Liveness

Recommended orchestration:

```text
POST /api/v1/identity-verification/attempts/:attemptId/liveness-session
```

Auth creates or requests the server-controlled provider session. The frontend completes it using
the approved capture component. Auth then asks Engine to retrieve and evaluate the result.

## 9.7 Internal token verification material

```text
GET /.well-known/jwks.json
```

Public-key material only.

---

# 10. Registration Workflow

## 10.1 Stage A — Citizen lookup

1. Receive a 16-digit NID.
2. Normalize and validate it.
3. Calculate a versioned HMAC lookup digest.
4. Apply distributed rate limits.
5. Check a short-lived distributed cache.
6. Call NIDA when not cached.
7. Validate and normalize the NIDA response.
8. Check document status and eligibility.
9. Check whether the identifier is already registered.
10. Create a short-lived `RegistrationChallenge`.
11. Encrypt the minimal citizen snapshot.
12. Return an opaque registration challenge token and minimized citizen preview.

The frontend must not be trusted to send citizen names or birth data back as authoritative
identity data.

## 10.2 Stage B — Registration submission

Expected input:

```json
{
  "registrationChallengeToken": "opaque-single-use-token",
  "email": "user@example.com",
  "password": "user-selected-password",
  "consents": [
    {
      "type": "TERMS",
      "policyVersion": "2026-07-01"
    },
    {
      "type": "PRIVACY",
      "policyVersion": "2026-07-01"
    },
    {
      "type": "BIOMETRIC_PROCESSING",
      "policyVersion": "2026-07-01"
    }
  ]
}
```

The transaction must:

1. lock and validate the registration challenge;
2. confirm it is unused and unexpired;
3. confirm email uniqueness;
4. confirm identity uniqueness;
5. hash the password;
6. create the user;
7. create the credential;
8. create the encrypted identity record;
9. create consent records;
10. create an email-verification token digest;
11. consume the registration challenge;
12. create an outbox event for verification email;
13. create a registration security event.

No external NIDA, email, S3, or Engine call may occur inside the transaction.

## 10.3 Email dispatch

Email sending occurs after commit through the outbox/queue.

The raw email-verification token exists only in the generated email action URL.

Store only its digest.

## 10.4 Registration response

Return:

```text
user reference
masked email
email verification required
identity verification required
next permitted action
```

Do not return:

```text
raw NID
encrypted NID
NID lookup digest
password hash
email token
NIDA provider payload
```

---

# 11. Email Verification

## 11.1 Token design

Use:

- at least 32 random bytes;
- URL-safe encoding;
- digest at rest;
- single use;
- short expiry, such as 24 hours;
- supersession when a newer token is issued;
- constant-time digest comparison where applicable.

## 11.2 Verification transaction

The transaction must:

- validate token digest;
- reject used, superseded, or expired tokens;
- mark token used;
- set `emailVerifiedAt`;
- activate the account when allowed;
- create a security event;
- emit a welcome/next-step outbox event.

## 11.3 Resend behavior

- generic response whether the email exists or not;
- rate limit per IP and normalized email;
- invalidate or supersede previous active token;
- no direct email call inside transaction;
- no account-state disclosure.

---

# 12. Login and Session Model

## 12.1 Login protections

The login response must be generic for:

- unknown email;
- wrong password;
- inactive account where disclosure is unsafe.

Use a dummy password hash when the account does not exist to reduce timing differences.

Apply distributed rate limits by:

- IP;
- normalized email HMAC;
- device;
- account;
- risk category.

Support account delay/temporary lockout without creating an easy denial-of-service vector.

## 12.2 Account gates

After valid credentials:

```text
email not verified     -> reject with safe next-step state
account disabled       -> reject
identity not verified  -> issue LIMITED session
identity verified      -> issue FULL session
```

## 12.3 Session levels

### Limited

May access only:

- own authentication state;
- email verification functions;
- identity-verification functions;
- logout;
- narrowly approved support routes.

May not:

- register devices;
- create transfers;
- access agreements;
- sign agreements;
- access normal user APIs.

### Full

May access the normal authenticated MUCYORA user APIs, subject to authorization and step-up rules.

## 12.4 Access tokens

Recommended claims:

```json
{
  "iss": "mucyora-auth",
  "aud": ["mucyora-user"],
  "sub": "user-uuid",
  "sid": "session-uuid",
  "jti": "token-uuid",
  "sessionLevel": "FULL",
  "identityVerified": true,
  "emailVerified": true,
  "tokenType": "ACCESS",
  "iat": 0,
  "exp": 0
}
```

Do not put the National ID, birth date, email, profile data, or permissions snapshot in access
tokens unless strictly required.

Recommended duration:

```text
access token: 10–15 minutes
limited access token: configurable; tightly scoped
```

## 12.5 Refresh tokens

Use opaque random refresh tokens.

Store only a strong digest.

Every refresh token belongs to:

```text
user
session
token family
generation
device context
expiry
```

On refresh:

1. validate token digest;
2. atomically consume current generation;
3. issue next generation;
4. mark relationship to replacement;
5. update session activity;
6. return new access and refresh tokens.

## 12.6 Reuse detection

When a consumed token is presented again outside an allowed race window:

- mark reuse;
- revoke the token family;
- revoke the affected session;
- optionally revoke all sessions based on policy;
- create a high-severity security event;
- notify the user when appropriate.

Do not depend only on a process-local `Map` to avoid false replay detection. It will fail across
multiple instances.

Use database uniqueness/locking, Redis coordination, or another distributed design.

## 12.7 Browser token transport

Preferred browser design:

- access token held in memory;
- refresh token in `HttpOnly`, `Secure`, appropriately scoped cookie;
- CSRF protections when cookie authentication is used;
- strict origin and CORS controls.

For native clients, store refresh tokens in secure platform storage.

Returning refresh tokens in JSON may remain only as a documented compatibility mode.

## 12.8 Session upgrade

After identity verification:

1. ensure the user has a valid limited session;
2. atomically revoke or rotate the limited refresh family;
3. create or upgrade to a full session;
4. issue full access and refresh tokens;
5. record the upgrade event;
6. prevent replay of old limited tokens beyond their natural access-token expiry.

---

# 13. Password Security

## 13.1 Password policy

For password-only authentication:

- minimum 15 characters;
- permit long passphrases;
- maximum at least 128 characters;
- no silent truncation;
- allow Unicode;
- reject known compromised/common passwords;
- do not require arbitrary composition rules;
- do not force scheduled changes without evidence of compromise;
- allow password-manager paste and autofill.

When strong MFA is later mandatory, the minimum may be reviewed under the approved policy.

## 13.2 Hashing

Recommended Argon2id parameters must be benchmarked on production-class hardware.

Target:

- resistant to GPU cracking;
- acceptable login latency;
- bounded concurrent resource use;
- versioned parameters stored with the hash;
- automatic rehash after successful login when parameters are outdated.

Do not lower password cost merely to make load tests look faster.

## 13.3 Forgot password

- generic response;
- token digest at rest;
- short expiry;
- single use;
- rate limits per email and IP;
- no account enumeration;
- send through outbox;
- revoke active reset tokens when one is consumed;
- revoke or review sessions after reset based on policy;
- send security notification.

## 13.4 Change password

Require:

- full authenticated session;
- current password or approved step-up;
- compromised-password check;
- password history policy only when approved;
- token-family/session rotation after change;
- security event and notification.

---

# 14. Identity Verification Workflow

## 14.1 Purpose

The workflow proves that the user controlling the account appears to be the same person represented
by the trusted NIDA identity record.

It must combine:

- authoritative NIDA identity;
- trusted NIDA portrait or approved ID-document portrait;
- real live-capture evidence;
- provider-backed liveness;
- face comparison;
- attempt controls;
- deterministic policy;
- manual-review path.

## 14.2 Important correction from the legacy workflow

A still selfie scored using eyes-open, brightness, sharpness, pose, and face confidence is capture
quality, not reliable liveness.

MUCYORA must use the hardened `mucyora/engine` contract and provider-backed liveness session defined
for the Engine project.

## 14.3 Verification purposes

Use explicit purpose values:

```text
ACCOUNT_ENROLLMENT
DEVICE_TRANSFER
AGREEMENT_SIGNING
ACCOUNT_RECOVERY
ADMIN_REQUESTED_REVIEW
```

The initial build must fully support `ACCOUNT_ENROLLMENT`.

Other purposes are step-up flows and may be implemented in their assigned phase.

## 14.4 Preconditions

For account enrollment:

- user exists;
- email is verified;
- account is active;
- identity is not already verified;
- attempt window allows another attempt;
- biometric-processing consent is valid;
- user holds an appropriate limited or full session.

## 14.5 Attempt creation

Creating an attempt must:

- generate an attempt UUID;
- select a verification policy version;
- record purpose;
- determine retry limits;
- create attempt-bound media namespaces;
- create or authorize a liveness session;
- establish expiry;
- create a security event.

## 14.6 Media handling

Preferred high-performance model:

1. Auth creates a short-lived, attempt-bound upload policy.
2. Client uploads directly to private object storage.
3. Policy enforces key prefix, size, content type, expiry, and checksum.
4. Auth verifies object metadata before Engine submission.
5. Engine receives only authorized references.

Alternative first-stage compatibility model:

- Auth accepts multipart files;
- validates and uploads in bounded parallel operations;
- never buffers unbounded input;
- never writes to local disk.

## 14.7 Media restrictions

For identity images:

- private storage only;
- allowed formats decided explicitly;
- validate magic bytes, not only MIME header;
- default maximum 5 MB per image;
- maximum dimensions/pixels;
- exactly one expected face;
- cryptographic checksum;
- random object ID;
- attempt-bound prefix;
- no NID/email/name in object key;
- deletion/retention deadline.

## 14.8 Engine request

Auth must send an authenticated internal request including:

```text
request ID
verification attempt ID
subject user UUID
authorized ID portrait reference
provider-backed liveness session reference
document/attempt binding state
requested policy version
idempotency key
```

Auth must not send the raw National ID to Engine.

## 14.9 Engine response handling

The response must distinguish:

```text
PASS
FAIL
RETRY
MANUAL_REVIEW
PROVIDER_UNAVAILABLE
INVALID_REQUEST
```

Persist:

```text
policy version
face similarity
liveness confidence
hard-gate results
quality results
provider references
reason code
evaluated time
```

Do not turn provider timeouts into identity mismatches.

## 14.10 Completion

On pass, in a short database transaction:

- mark attempt passed;
- mark user identity verified;
- store verification timestamp and policy;
- create security event;
- create outbox event;
- make session upgrade available.

On failure/retry:

- record the outcome;
- calculate server-authoritative `retryAfter`;
- schedule media cleanup;
- do not expose sensitive threshold details.

## 14.11 Attempt limits

Baseline parity:

```text
maximum 3 attempts in a configurable rolling window
default window 24 hours
```

The policy may also consider:

- IP;
- device;
- account age;
- repeated NIDA lookup;
- suspicious network;
- previous review;
- transfer risk.

The client must display server-provided retry times rather than calculating them locally.

## 14.12 Cleanup

Verification media cleanup must be:

- attempted immediately after terminal outcomes when policy allows;
- retried asynchronously;
- reconciled by a scheduled job;
- observable through metrics;
- held longer only for manual review, incident, or legal policy.

---

# 15. Step-Up Verification

Step-up verification is separate from account enrollment.

Sensitive operations may require a fresh proof even for an already verified account.

Examples:

- device ownership transfer;
- high-risk agreement signing;
- account recovery;
- unusual login;
- administrator-triggered review.

A step-up challenge must bind:

```text
user
session
purpose
target device/transfer/agreement
expiry
nonce
verification policy
completion status
```

A completed challenge may not be reused for another target or purpose.

This capability must not be implemented until its assigned phase is explicitly authorized.

---

# 16. Security Baseline

## 16.1 Input validation

Configure NestJS global validation:

```text
transform: true
whitelist: true
forbidNonWhitelisted: true
forbidUnknownValues: true
```

DTOs must enforce:

- exact formats;
- maximum lengths;
- enum values;
- nested validation;
- no unbounded metadata objects.

## 16.2 Error handling

External errors must never reveal:

- database details;
- stack traces;
- NIDA credentials;
- provider payloads;
- AWS keys;
- JWT signing material;
- encryption/HMAC keys;
- raw NIDs;
- exact account-existence state;
- internal thresholds.

Use stable application error codes and correlation IDs.

## 16.3 Rate limiting

Use distributed storage.

Create route-specific policies for:

| Operation | Example baseline |
|---|---:|
| Citizen lookup | 5/minute/IP plus NID digest controls |
| Registration | 3/hour/IP and identity digest |
| Email resend | 3/hour/email and IP |
| Login | 5/minute/account and IP |
| Refresh | 10/minute/session |
| Forgot password | 3/hour/email and IP |
| Verification submit | 3/10 minutes/user plus rolling-window rule |
| Session listing/revoke | conservative authenticated limit |
| JWKS | cacheable public limit |

These are initial values, not substitutes for production traffic analysis.

## 16.4 Secret management

Production secrets belong in a secret manager:

```text
CITIZEN_API_USERNAME
CITIZEN_API_PASSWORD
JWT_SIGNING_PRIVATE_KEY or signing provider reference
IDENTITY_ENCRYPTION_KEY/KMS reference
IDENTITY_LOOKUP_HMAC_KEY
EMAIL_TOKEN_HMAC_KEY where used
REFRESH_TOKEN_PEPPER where used
ENGINE_SERVICE_CREDENTIAL
AWS role configuration
MAIL credentials
REDIS credentials
```

Separate keys by purpose.

Version encryption and HMAC keys.

## 16.5 Identity privacy

Never log:

- NID;
- NIDA response;
- identity portrait;
- media object key;
- email/reset token;
- refresh token;
- password;
- ciphertext;
- JWT;
- provider credentials.

Mask identifiers only for authorized UI contexts.

## 16.6 CORS and browser security

- explicit origin allowlist;
- no wildcard with credentials;
- Helmet;
- secure cookies;
- CSRF protection where applicable;
- strict request body limits;
- Swagger disabled or strongly protected in production;
- no tokens in URLs;
- no sensitive data in browser storage.

## 16.7 Service-to-service security

Auth-to-Engine calls should use:

- mTLS;
- workload identity;
- or signed requests with caller, audience, timestamp, nonce, body digest, signature, and replay
  prevention.

A static API key is temporary migration compatibility, not the final design.

## 16.8 Dependency and supply-chain security

CI must include:

```text
npm ci
npm run lint
npm run build
npm test
npm run test:e2e
npm run test:cov
npm audit --audit-level=high
secret scanning
container scanning
SBOM generation
```

Pin critical GitHub Actions to reviewed versions or digests under the platform policy.

## 16.9 Auditability

Every sensitive operation creates a structured event:

- registration started/completed/failed;
- NIDA lookup success/failure category;
- email verification;
- login success/failure;
- account lock;
- refresh rotation;
- refresh reuse;
- session upgrade/revoke;
- password reset/change;
- identity attempt started/completed;
- verification pass/fail/retry/review;
- restricted identity access;
- encryption-key version change;
- admin-requested review.

Safe metadata only.

---

# 17. Performance and Reliability Requirements

Security work must not be bypassed for speed. Performance must come from architecture, concurrency,
caching, and efficient database access.

## 17.1 Database

- select only required columns;
- use indexes defined in `api/db`;
- avoid N+1 queries;
- keep transactions short;
- do not perform external HTTP, mail, S3, or Engine calls inside transactions;
- use optimistic locking where sessions can race;
- use connection pooling;
- set query and transaction timeouts;
- monitor slow queries.

## 17.2 NIDA

- HTTP keep-alive;
- distributed 5-minute positive cache;
- bounded retry;
- circuit breaker;
- provider timeout;
- concurrency limit;
- no duplicate in-flight lookup for the same NID HMAC when safe;
- metrics by response class, never by raw identifier.

## 17.3 Password hashing

Password hashing is intentionally expensive.

Use a bounded worker/concurrency strategy and benchmark Argon2id.

Do not block the event loop with avoidable synchronous cryptographic work.

## 17.4 Email

Use outbox plus queue.

The registration, resend, and reset API must not wait for the mail provider.

## 17.5 Verification media

Prefer direct private uploads using short-lived, attempt-bound policies.

When the API handles media:

- stream;
- enforce size during transfer;
- upload ID and live media concurrently within bounds;
- abort both on failure;
- avoid disk;
- use checksums;
- use object-storage connection reuse.

## 17.6 Engine

- explicit connection/response timeouts;
- idempotency;
- circuit breaker;
- bounded concurrency;
- no blind retry of biometric execution;
- separate provider-unavailable state;
- asynchronous status model when verification latency requires it.

## 17.7 Cache behavior

Cache is an optimization, not the source of truth.

Auth correctness must survive cache loss.

## 17.8 Initial service objectives

Measure on production-like hardware and adjust through evidence.

| Operation | Initial objective |
|---|---|
| `/health/live` | p95 under 50 ms |
| Session/status read | p95 under 150 ms |
| Refresh rotation | p95 under 250 ms excluding network extremes |
| Cached citizen lookup application overhead | p95 under 100 ms excluding client network |
| Login | p95 under 750 ms with approved password hashing |
| Registration transaction | p95 under 500 ms excluding NIDA and email |
| Verification attempt creation | p95 under 300 ms excluding provider calls |
| Error rate | below agreed SLO, separated by dependency errors |
| Availability | defined separately for Auth and external dependencies |

Do not hide NIDA, mail, S3, or Engine outages inside Auth latency statistics.

---

# 18. Implementation Phases

Each phase is independently command-gated.

---

## Phase 0 — Repository Audit and Reference Mapping

### Objective

Inspect the generated MUCYORA Auth project, inspect the reference repository, and produce an exact
gap report without implementing business functionality.

### Tasks

- inspect `mucyora/api/auth`;
- inspect `gracon-user-auth-service`;
- inspect `@mucyora/db` exports and schema;
- inventory reference modules, endpoints, DTOs, guards, integrations, tests, and configuration;
- map reference features to MUCYORA boundaries;
- identify functionality that must move to `api/user`;
- identify required database changes;
- identify legacy dependencies and insecure patterns;
- create `docs/reference-parity-matrix.md`;
- create a phase-by-phase change map;
- make no functional API changes.

### Security gate

- no credentials copied;
- no real provider call;
- no secret placed in documentation;
- no migration applied;
- no production data accessed.

### Performance gate

- identify current blocking operations;
- identify process-local coordination that fails under horizontal scaling;
- identify external calls inside transactions;
- identify unbounded upload/download behavior.

### Expected output

```text
docs/reference-parity-matrix.md
docs/current-state-audit.md
docs/database-change-proposal.md
documented list of retained, removed, and redesigned features
```

### Stop point

Codex stops after the audit.

---

## Phase 1 — Service Foundation and Ownership Boundary

### Objective

Establish a production-grade NestJS service foundation without adding registration logic.

### Tasks

- configure strict environment validation;
- configure global DTO validation;
- configure Helmet;
- configure CORS allowlist;
- add structured logging and correlation IDs;
- add exception filter;
- add request-size limits;
- add `/health/live` and `/health/ready`;
- configure Swagger as disabled/protected in production;
- integrate `@mucyora/db`;
- remove direct Prisma dependencies;
- add project-boundary assertion script;
- create target module folders;
- add `README.md`, `SECURITY.md`, and base docs;
- add Dockerfile;
- add CI baseline.

### Security gate

- no database migration ownership;
- no wildcard credentialed CORS;
- no stack trace in production response;
- no secrets in logs;
- production Swagger disabled by default;
- runtime DB role is `mucyora_auth_app`.

### Performance gate

- lightweight liveness probe;
- readiness checks cached;
- graceful shutdown;
- connection-pool configuration;
- no dependency call from liveness probe.

### Expected output

A buildable Auth skeleton with service boundaries, security middleware, health endpoints, CI, and
documentation.

### Stop point

No NIDA, registration, login, or verification functionality is implemented yet.

---

## Phase 2 — Database Contract and Security Primitives

### Objective

Define and consume the database contract and create reusable cryptographic/security primitives.

### Tasks

- verify required schema entities;
- produce or consume the authorized `api/db` migration;
- add database adapter/service through `@mucyora/db`;
- implement email normalization;
- implement NID normalization;
- implement versioned HMAC lookup;
- implement versioned AES-GCM/KMS envelope interface;
- implement token generation and token digest utilities;
- implement safe masking;
- implement idempotency support;
- implement security-event writer;
- add tests and test vectors.

### Security gate

- no plain NID persistence;
- no ordinary unsalted NID hash;
- tampered ciphertext fails authentication;
- keys are purpose-separated;
- plaintext identity does not appear in logs/errors/tests;
- generated secrets use cryptographically secure randomness.

### Performance gate

- cryptographic utilities benchmarked;
- lookup is index-friendly;
- encryption/decryption does not perform unnecessary repeated work;
- database queries are bounded.

### Expected output

Reusable, tested security primitives and an approved shared database contract.

### Stop point

No public NIDA or registration endpoint is enabled.

---

## Phase 3 — NIDA Citizen API Adapter

### Objective

Implement a secure, resilient, and testable NIDA adapter using `CITIZEN_API_URL`.

### Tasks

- create provider interface;
- implement HTTP client;
- implement provider authentication;
- normalize provider response;
- validate expected response schema;
- implement timeouts;
- implement bounded retries and backoff;
- implement circuit breaker;
- implement distributed positive cache;
- implement duplicate in-flight suppression where safe;
- implement privacy-safe metrics and logs;
- write unit, integration, and failure tests;
- use mocked/local provider in tests.

### Security gate

- credentials never exposed;
- TLS validation enabled;
- no raw NID in cache keys/logs;
- complete provider response not returned or persisted;
- provider errors mapped safely;
- SSRF-safe fixed base URL configuration.

### Performance gate

- HTTP connection reuse;
- 5-minute configurable cache;
- timeout behavior verified;
- no retry storms;
- circuit breaker verified;
- concurrent same-identifier requests tested.

### Expected output

A production-oriented NIDA adapter with no public registration endpoint yet.

### Stop point

Codex does not implement registration until Phase 4 is commanded.

---

## Phase 4 — Citizen Lookup and Registration Challenge

### Objective

Expose protected NIDA identity lookup and create a secure, short-lived registration challenge.

### Tasks

- implement citizen lookup DTO and endpoint;
- apply NID validation;
- apply distributed multi-dimensional rate limits;
- call NIDA adapter;
- check identity uniqueness without disclosing account state;
- encrypt minimal citizen snapshot;
- issue opaque single-use registration challenge;
- add challenge expiry and attempt controls;
- add audit events;
- add contract, e2e, abuse, and enumeration tests.

### Security gate

- anti-enumeration behavior tested;
- NID not returned unnecessarily;
- challenge is single-use and short-lived;
- NIDA payload minimized;
- rate limits stored distributively;
- generic safe errors.

### Performance gate

- cached lookup path tested;
- database uniqueness lookup indexed;
- challenge creation uses a short transaction;
- no external call inside transaction.

### Expected output

A secure NIDA-backed registration initiation endpoint returning an opaque challenge and minimal
identity preview.

### Stop point

No user account is created until Phase 5.

---

## Phase 5 — Atomic Registration and Email Verification

### Objective

Create users atomically and complete email-verification workflows.

### Tasks

- implement registration DTO and endpoint;
- validate and consume registration challenge;
- hash passwords with Argon2id;
- create user, credential, identity, consent, token, audit, and outbox records atomically;
- implement email-verification endpoint;
- implement resend endpoint;
- implement mail templates and outbox worker;
- implement token supersession;
- implement welcome/next-step notification;
- add rollback, concurrency, duplicate-email, duplicate-NID, and token tests.

### Security gate

- no external call inside registration transaction;
- raw tokens never stored;
- duplicate registration races handled by DB constraints;
- email responses resist enumeration;
- password blocklist integrated;
- biometric consent version stored;
- failed mail does not roll back account creation.

### Performance gate

- email dispatch asynchronous;
- registration transaction short and indexed;
- duplicate attempts idempotent where appropriate;
- concurrent registration load tested.

### Expected output

A complete NIDA-backed account-registration and email-verification workflow.

### Stop point

Registration works, but login/session functionality waits for Phase 6.

---

## Phase 6 — Login, JWT, Refresh Rotation, and Session Management

### Objective

Implement secure limited/full sessions and distributed refresh-token rotation.

### Tasks

- implement login;
- implement dummy password verification for unknown accounts;
- implement limited/full account gates;
- implement asymmetric JWT signing;
- expose JWKS;
- implement refresh tokens and session families;
- implement atomic rotation;
- implement replay/reuse detection;
- implement logout and logout-all;
- implement session listing and individual revocation;
- implement device/session metadata;
- implement browser cookie mode and native compatibility mode;
- add security events and notifications;
- add concurrency and multi-instance tests.

### Security gate

- no shared symmetric secret required by other services;
- refresh token digest only;
- reuse revokes correct scope;
- generic login errors;
- cookies secure and HttpOnly;
- CSRF defense tested for cookie mode;
- revoked sessions rejected;
- token claims minimized.

### Performance gate

- refresh path uses indexed lookup;
- no process-local-only race protection;
- JWKS cache headers configured;
- concurrent refresh tests pass;
- password hashing concurrency bounded.

### Expected output

Production-grade authentication with limited/full access, secure session management, rotation, and
replay detection.

### Stop point

Identity verification and session upgrade are not implemented until later phases.

---

## Phase 7 — Password Recovery and Password Change

### Objective

Implement secure password lifecycle operations.

### Tasks

- forgot-password endpoint;
- reset-password endpoint;
- change-password endpoint;
- generic responses;
- token digest and expiry;
- outbox email;
- password blocklist;
- Argon2 rehash policy;
- session/token revocation policy;
- security notifications;
- rate-limit and abuse tests.

### Security gate

- no account enumeration;
- reset token single-use;
- current password or step-up required for change;
- compromised passwords rejected;
- session revocation behavior verified.

### Performance gate

- mail asynchronous;
- token lookup indexed;
- hashing concurrency controlled;
- no unnecessary global session scan.

### Expected output

A complete, tested password recovery and change workflow.

### Stop point

No biometric verification implementation until Phase 8.

---

## Phase 8 — Account Identity Verification and Engine Integration

### Objective

Implement all account-enrollment verification behavior using the hardened MUCYORA Engine contract.

### Tasks

- create verification-attempt endpoint;
- enforce email/account/consent/attempt gates;
- implement private attempt-bound media;
- implement direct upload policy or secure streaming upload;
- create provider-backed liveness session;
- validate media metadata;
- call Engine with authenticated internal request;
- persist normalized evidence;
- implement pass/fail/retry/review/unavailable states;
- implement attempt limits and `retryAfter`;
- implement media cleanup and reconciliation;
- update identity-verification state on pass;
- add status endpoints;
- add comprehensive tests.

### Security gate

- real liveness used;
- raw NID never sent to Engine;
- object references attempt-bound;
- media byte/type/dimension limits enforced;
- Engine request authenticated and replay-protected;
- provider errors not treated as identity mismatch;
- thresholds not exposed publicly;
- media cleanup tested.

### Performance gate

- direct upload preferred;
- bounded parallel operations;
- no local-disk media;
- timeouts and circuit breaker;
- asynchronous status supported where needed;
- object-storage and Engine concurrency controlled.

### Expected output

A complete NIDA-linked biometric account verification flow with secure evidence and controlled
retry behavior.

### Stop point

Session upgrade waits for Phase 9.

---

## Phase 9 — Limited-to-Full Session Upgrade

### Objective

Upgrade a successfully verified user from a limited session to a full session without replay or
race vulnerabilities.

### Tasks

- implement upgrade endpoint;
- verify passed account-enrollment attempt;
- verify user identity state;
- rotate/revoke limited session family;
- issue full session;
- add idempotency;
- add security event;
- add concurrent upgrade tests;
- add rollback behavior.

### Security gate

- one verification result cannot upgrade another user;
- old limited refresh token cannot create new limited chains;
- concurrent upgrades create one valid result;
- already-upgraded calls are safely idempotent.

### Performance gate

- short transaction;
- indexed status lookup;
- no Engine/NIDA call during upgrade.

### Expected output

Verified users can obtain secure full sessions and access normal MUCYORA services.

### Stop point

Step-up verification for transfers/signing waits for Phase 10.

---

## Phase 10 — Step-Up Identity Challenges

### Objective

Support fresh verification for high-risk operations.

### Tasks

- implement challenge model and endpoints;
- support `DEVICE_TRANSFER`, `AGREEMENT_SIGNING`, and `ACCOUNT_RECOVERY`;
- bind challenge to target resource;
- define validity duration;
- reuse Engine workflow with stricter policy where required;
- expose internal verification assertion to authorized service;
- prevent replay and cross-purpose use;
- integrate audit and expiry cleanup;
- write contract tests with `api/user` and `api/signature`.

### Security gate

- target binding enforced;
- challenge one-time and purpose-specific;
- short-lived assertion;
- caller service authenticated;
- no generic “verified forever” bypass.

### Performance gate

- reuse verification infrastructure;
- no duplicate media processing when policy allows safe recent-proof reuse;
- target lookup indexed;
- internal assertion cache bounded and not authoritative.

### Expected output

MUCYORA can require fresh proof before a device transfer, sensitive agreement signing, or account
recovery.

### Stop point

Operational optimization and release work wait for later phases.

---

## Phase 11 — Outbox, Cleanup, Audit, and Operational Jobs

### Objective

Make asynchronous and recovery behavior production-safe.

### Tasks

- outbox worker;
- email retries;
- expired token cleanup;
- expired session cleanup;
- verification-media deletion retries;
- orphaned-media reconciliation;
- stale verification-attempt expiration;
- security-event retention;
- dead-letter handling;
- job leader election/distributed locking;
- operational dashboards and alerts.

### Security gate

- jobs use least privilege;
- no sensitive payload in queue logs;
- deletion respects review/legal holds;
- retry does not duplicate emails or actions;
- outbox payload minimized.

### Performance gate

- batch sizes bounded;
- indexes support cleanup;
- jobs do not create table-wide locks;
- retries use backoff;
- workers scale independently.

### Expected output

Reliable asynchronous processing, cleanup, reconciliation, and audit operations.

### Stop point

No production release until Phase 12 and Phase 13 gates pass.

---

## Phase 12 — Performance, Resilience, and Load Validation

### Objective

Measure and improve performance without weakening security.

### Tasks

- create k6/Artillery or approved load tests;
- benchmark login and Argon2 parameters;
- benchmark refresh rotation;
- test NIDA cache and circuit breaker;
- test Redis/database failure behavior;
- test external dependency timeouts;
- test multi-instance refresh and registration races;
- inspect database query plans;
- remove N+1 queries;
- tune pools and concurrency;
- define service SLO dashboard;
- perform controlled soak test.

### Security gate

- password cost remains approved;
- rate limiting remains effective under load;
- no sensitive test data;
- no production NIDA calls;
- no disabled validation or auditing.

### Performance gate

- agreed p95/p99 objectives met or exceptions documented;
- no connection exhaustion;
- no event-loop starvation;
- no retry storms;
- no unbounded memory growth;
- graceful degradation demonstrated.

### Expected output

A measured performance report, query-plan review, load-test suite, tuning changes, and approved
capacity assumptions.

### Stop point

Release hardening remains in Phase 13.

---

## Phase 13 — Final Security Review, CI/CD, and Release Readiness

### Objective

Make the service ready for controlled staging and production rollout.

### Tasks

- complete threat model;
- dependency and container scans;
- secret scan;
- SBOM;
- API contract verification;
- database boundary verification;
- restore and recovery exercises;
- signing-key/JWT-key rotation drill;
- NIDA credential rotation drill;
- Engine credential rotation drill;
- incident-response runbook;
- operational alerts;
- penetration/security review;
- staged deployment plan;
- compatibility-removal plan;
- final documentation.

### Security gate

- no critical/high unaccepted findings;
- secrets externally managed;
- IAM least privilege;
- database runtime role verified;
- TLS/private networking verified;
- audit and incident procedures tested;
- account/session/key rotation tested.

### Performance gate

- staging load and soak tests pass;
- readiness behavior verified;
- autoscaling and resource limits configured;
- dependency quotas documented;
- alert thresholds established.

### Expected output

A production-readiness package and a controlled deployment plan. Deployment itself still requires
a separate explicit command.

### Stop point

Codex must not deploy automatically.

---

# 19. Testing Matrix

## 19.1 Unit

- normalization;
- HMAC;
- encryption;
- token digest;
- password policy;
- JWT claims;
- NIDA response mapping;
- error mapping;
- attempt-limit calculation;
- session gates;
- reason codes;
- log redaction.

## 19.2 Integration

- shared database client;
- Redis;
- NIDA adapter mock;
- mail adapter;
- S3 adapter;
- Engine adapter;
- outbox worker;
- key rotation providers.

## 19.3 End-to-end

- citizen lookup;
- complete registration;
- duplicate email/NID;
- email verification;
- resend;
- login limited/full;
- refresh rotation;
- refresh reuse;
- logout/logout-all;
- password recovery/change;
- verification success/failure/retry/provider outage;
- session upgrade;
- step-up challenges.

## 19.4 Concurrency

- two registrations for same email;
- two registrations for same NID;
- parallel refresh requests;
- replay from another instance;
- parallel email token use;
- parallel reset token use;
- parallel verification submissions;
- parallel session upgrade.

## 19.5 Security

- enumeration;
- brute force;
- rate-limit bypass;
- JWT confusion;
- CSRF;
- CORS;
- malformed DTO;
- oversized body;
- malicious image;
- object-key traversal;
- cross-attempt media;
- replayed Engine request;
- ciphertext tampering;
- log leakage;
- NIDA credential leakage;
- SSRF;
- stale token acceptance.

## 19.6 Performance

- login;
- refresh;
- cached/uncached lookup using mock provider;
- registration transaction;
- email outbox;
- status endpoint;
- verification attempt creation;
- cleanup jobs;
- multi-instance behavior.

---

# 20. Required Environment Template

The final `.env.example` should contain placeholders only.

```env
APP_ENV=development
APP_PORT=3000
LOG_LEVEL=debug

DATABASE_URL=postgresql://mucyora_auth_app:replace-me@localhost:5432/mucyora

REDIS_URL=redis://localhost:6379
CACHE_PREFIX=mucyora:auth:

CITIZEN_API_URL=
CITIZEN_API_USERNAME=
CITIZEN_API_PASSWORD=
CITIZEN_API_CONNECT_TIMEOUT_MS=3000
CITIZEN_API_RESPONSE_TIMEOUT_MS=10000
CITIZEN_API_MAX_RETRIES=2
CITIZEN_CACHE_TTL_SECONDS=300

MUCYORA_AUTH_ISSUER=http://localhost:3000
MUCYORA_AUTH_ACCESS_AUDIENCES=mucyora-user,mucyora-signature
MUCYORA_AUTH_SIGNING_KEY_ID=
MUCYORA_AUTH_SIGNING_PRIVATE_KEY=
MUCYORA_AUTH_SIGNING_PUBLIC_KEY=
ACCESS_TOKEN_TTL_SECONDS=900
LIMITED_ACCESS_TOKEN_TTL_SECONDS=7200
REFRESH_TOKEN_TTL_SECONDS=2592000

IDENTITY_ENCRYPTION_PROVIDER=SOFTWARE_GCM
IDENTITY_ENCRYPTION_KEY_VERSION=v1
IDENTITY_ENCRYPTION_SECRET=
IDENTITY_LOOKUP_KEY_VERSION=v1
IDENTITY_LOOKUP_HMAC_KEY=

EMAIL_TOKEN_TTL_SECONDS=86400
PASSWORD_RESET_TOKEN_TTL_SECONDS=3600

MAIL_PROVIDER=
MAIL_FROM=
MAIL_API_KEY=
MUCYORA_USER_APP_URL=http://localhost:4000

AWS_REGION=
AWS_S3_VERIFICATION_BUCKET=
AWS_S3_VERIFICATION_PREFIX=identity-verification/
VERIFICATION_MEDIA_MAX_SIZE_BYTES=5242880
VERIFICATION_MEDIA_RETENTION_SECONDS=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_SESSION_TOKEN=

MUCYORA_ENGINE_URL=http://localhost:8000
MUCYORA_ENGINE_SERVICE_KEY=
MUCYORA_ENGINE_TIMEOUT_MS=45000

VERIFICATION_MAX_ATTEMPTS=3
VERIFICATION_ATTEMPT_WINDOW_HOURS=24
VERIFICATION_POLICY_VERSION=2026-07-01

ENABLE_SWAGGER=false
DOCS_BASIC_AUTH_USER=
DOCS_BASIC_AUTH_PASS=

CORS_ALLOWED_ORIGINS=http://localhost:4000
COOKIE_DOMAIN=
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
```

Production should use workload identity, key-management systems, and secret-manager injection
instead of static cloud credentials or private keys in ordinary environment variables where the
deployment platform supports it.

---

# 21. Definition of Done for Every Phase

A phase is complete only when:

- authorized scope is implemented;
- later phases are untouched;
- project builds;
- lint passes;
- relevant unit tests pass;
- relevant integration/e2e tests pass;
- security controls have tests;
- documentation is updated;
- no secret is committed;
- no local Prisma schema is created;
- database changes are isolated to the approved `api/db` work;
- API changes are documented;
- performance implications are measured or explicitly deferred;
- unresolved risks are listed;
- Codex prints the required stop statement.

---

# 22. Final Expected Output After All Phases

When all phases are separately authorized and completed, MUCYORA will have:

## 22.1 Functional result

- NIDA-backed citizen lookup through `CITIZEN_API_URL`;
- secure NID registration;
- atomic account creation;
- consent capture;
- email verification;
- limited and full authentication sessions;
- secure login;
- asymmetric JWT and JWKS;
- opaque refresh-token rotation;
- refresh replay detection;
- session management;
- password reset and change;
- NIDA-linked biometric account verification;
- real liveness and face comparison through MUCYORA Engine;
- verification attempt controls;
- limited-to-full session upgrade;
- step-up verification for transfers and signing;
- asynchronous email and cleanup;
- auditable security events.

## 22.2 Security result

- no plaintext NID at rest;
- no plain enumerable NID hash;
- authenticated encryption;
- purpose-separated, versioned keys;
- Argon2id passwords;
- minimized JWT claims;
- distributed throttling;
- generic authentication responses;
- protected refresh cookies for browsers;
- replay detection;
- private attempt-bound media;
- no raw NID sent to Engine;
- real liveness;
- strict service boundaries;
- least-privilege database role;
- tested incident and key-rotation procedures.

## 22.3 Performance result

- cached and pooled NIDA access;
- short database transactions;
- asynchronous email;
- direct or streamed private media upload;
- bounded concurrency;
- horizontally safe session rotation;
- circuit breakers and timeouts;
- indexed database access;
- measured p95/p99 latency;
- tested degradation behavior;
- operational metrics and alerts.

## 22.4 Repository result

```text
mucyora/api/auth
```

will be a documented, tested, containerized NestJS service that consumes `@mucyora/db`, calls
NIDA and MUCYORA Engine through controlled adapters, publishes public token-verification material,
and owns only MUCYORA authentication and identity-verification responsibilities.

---

# 23. Suggested Commands to Give Codex

Start with:

```text
Read MUCYORA_AUTH_IMPLEMENTATION_PLAN.md and implement Phase 0 only.
Do not implement any later phase. Follow the command-gated execution protocol exactly.
```

After reviewing Phase 0:

```text
Implement Phase 1 only from MUCYORA_AUTH_IMPLEMENTATION_PLAN.md.
Preserve the conclusions from Phase 0 and stop after Phase 1.
```

For a later phase:

```text
Implement Phase 6 only from MUCYORA_AUTH_IMPLEMENTATION_PLAN.md.
First verify that its prerequisite phases are complete. Do not implement Phase 7 or any later phase.
```

For review without implementation:

```text
Review the current repository against Phase 8 of MUCYORA_AUTH_IMPLEMENTATION_PLAN.md.
Report gaps only. Do not modify files.
```

For corrections:

```text
Fix only the unresolved findings from Phase 5.
Do not start another phase.
```

---

# 24. Reference Material

## Project reference

- Gracon User Auth Service:  
  `https://github.com/kajugadaniels/gracon-user-auth-service`

## MUCYORA related components

- Database foundation: `mucyora/api/db`
- Biometric engine: `mucyora/engine`
- Signature service: `mucyora/api/signature`
- User service: `mucyora/api/user`
- Admin service: `mucyora/api/admin`

## Security references

- OWASP Authentication Cheat Sheet:  
  `https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html`

- OWASP Password Storage Cheat Sheet:  
  `https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html`

- OWASP Session Management Cheat Sheet:  
  `https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html`

- OWASP File Upload Cheat Sheet:  
  `https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html`

- NIST SP 800-63B:  
  `https://pages.nist.gov/800-63-4/sp800-63b.html`

- AWS S3 security best practices:  
  `https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html`

---

# 25. Final Instruction to Codex

This document is an implementation authority only when paired with an explicit phase command.

Codex must preserve the MUCYORA architecture, treat security and privacy controls as required
functionality, measure performance rather than guessing, and stop after every authorized phase.

No phase grants permission to implement another phase.
