import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function main(): Promise<void> {
  const manifestPath = process.env.RELEASE_EVIDENCE_MANIFEST;
  if (!manifestPath) {
    throw new Error('RELEASE_EVIDENCE_MANIFEST is required.');
  }
  const manifest = JSON.parse(
    await readFile(resolve(manifestPath), 'utf8'),
  ) as unknown;
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Release evidence manifest must be an object.');
  }
  const record = manifest as Record<string, unknown>;
  if (
    typeof record.releaseCandidate !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(record.releaseCandidate)
  ) {
    throw new Error(
      'Release evidence requires an immutable sha256 image digest.',
    );
  }
  if (!record.gates || typeof record.gates !== 'object') {
    throw new Error('Release evidence gates are required.');
  }
  const gates = record.gates as Record<string, unknown>;
  const incomplete = Object.entries(gates)
    .filter(([, status]) => status !== 'PASSED')
    .map(([gate]) => gate);
  if (incomplete.length) {
    throw new Error(`Release evidence is incomplete: ${incomplete.join(', ')}`);
  }
  if (
    !Array.isArray(record.approvers) ||
    record.approvers.length < 3 ||
    !Array.isArray(record.evidenceReferences) ||
    record.evidenceReferences.length < Object.keys(gates).length
  ) {
    throw new Error(
      'Release evidence requires three approvers and one reference per gate.',
    );
  }
  console.log('Release evidence manifest passed all controlled rollout gates.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
