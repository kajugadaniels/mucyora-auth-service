# Identity Data Protection

## Implemented Phase 2 Primitives

Auth provides reusable primitives for:

- email normalization using Unicode NFKC, trimming, and lowercase canonical
  form;
- Rwanda NID normalization to an exact 16-digit string;
- safe identifier masking;
- versioned HMAC-SHA-256 identity lookup digests;
- AES-256-GCM authenticated encryption with purpose-bound additional data;
- opaque cryptographically random tokens and digest-only persistence;
- purpose-separated key validation.

These primitives do not expose a public endpoint and do not call NIDA.

## Storage Shape

A protected Rwanda NID is represented by separate values:

```text
encryptedIdentifier
identifierLookupDigest
maskedIdentifier
encryptionVersion
lookupKeyVersion
source = NIDA
```

The lookup digest has this conceptual construction:

```text
v<version>:HMAC-SHA-256(
  lookup-key,
  "mucyora-auth:identity-lookup:" + normalized-nid
)
```

It is index-friendly and does not use an ordinary enumerable NID hash.

The encryption envelope contains only:

```text
format
version
nonce
ciphertext
authentication tag
```

AES-GCM additional authenticated data binds the ciphertext to the service,
format version, key version, and purpose. A ciphertext cannot be reused as a
different protected value without failing authentication.

## Key Separation

The following key material must be generated independently:

- `IDENTITY_ENCRYPTION_SECRET`;
- `IDENTITY_LOOKUP_HMAC_KEY`;
- `TOKEN_DIGEST_HMAC_KEY`;
- `REQUEST_CONTEXT_HMAC_KEY`.

Startup rejects identical key material. Production should inject keys from a
secret manager or KMS. The current `SOFTWARE_GCM` provider implements the
envelope interface so a KMS-backed provider can replace it without changing
domain workflows.

## Rotation

- New ciphertext and lookup digests use the configured current versions.
- Readers must select keys by stored version during a future rotation.
- Do not silently rewrite existing AES-CBC ciphertext or `nidHash` values.
- Backfill requires an approved, observable, resumable key-aware job.
- Old keys remain available only for the approved read/rotation window.

Phase 2 does not perform a legacy identity backfill.

## Logging and Testing

Never log plaintext identifiers, encryption envelopes, lookup inputs, key
material, or raw tokens. Tests and benchmarks use explicitly synthetic strings
and non-production deterministic keys.

The test suite includes fixed HMAC and AES-GCM vectors, round trips,
purpose-confusion rejection, ciphertext-tampering rejection, invalid NID
rejection, token entropy checks, and key-separation checks.

