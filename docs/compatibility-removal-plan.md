# Compatibility Removal Plan

Legacy database fields and readers remain only where the shared schema still
requires a safe migration window. Removal is owned by `api/db`; Auth must not
delete schema or migrations.

For each compatibility path:

1. identify every reader, writer, job, query, and downstream consumer;
2. stop legacy writes and measure remaining legacy rows;
3. backfill with an idempotent, restartable, audited database job;
4. deploy dual-read code only when required for rollback;
5. prove the new representation is authoritative in staging and production;
6. wait through the agreed rollback and data-retention window;
7. remove the Auth reader in a dedicated release;
8. remove columns/indexes in a separately reviewed `api/db` migration.

Current candidates are legacy reset-token cleanup, legacy verification-media
reference reconciliation, and legacy identity compatibility fields documented
by `api/db`. Each requires an owner, usage metric, zero-use observation window,
rollback procedure, and security/data review before removal.
