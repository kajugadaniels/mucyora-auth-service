import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const contract = JSON.parse(
  await readFile(join(root, 'contracts/auth-api-contract.json'), 'utf8'),
);
const discovered = [];

for (const file of await controllers(join(root, 'src/modules'))) {
  const source = await readFile(file, 'utf8');
  const controller = source.match(/@Controller\((?:'([^']*)'|"([^"]*)")\)/);
  if (!controller) continue;
  const base = controller[1] ?? controller[2] ?? '';
  const methodPattern =
    /@(Get|Post|Put|Patch|Delete)\((?:'([^']*)'|"([^"]*)"|)\)/g;
  for (const match of source.matchAll(methodPattern)) {
    const method = match[1].toUpperCase();
    const child = match[2] ?? match[3] ?? '';
    const localPath = [base, child].filter(Boolean).join('/');
    const excluded = ['health/live', 'health/ready', '.well-known/jwks.json'];
    const prefix = excluded.includes(localPath) ? '' : '/api/v1';
    discovered.push(`${method} ${prefix}/${localPath}`.replace(/\/+$/, ''));
  }
}

const expected = [...contract.endpoints].sort();
const actual = [...new Set(discovered)].sort();
const missing = expected.filter((endpoint) => !actual.includes(endpoint));
const undocumented = actual.filter((endpoint) => !expected.includes(endpoint));

if (missing.length || undocumented.length) {
  console.error('Auth API contract verification failed.');
  for (const endpoint of missing) console.error(`- missing: ${endpoint}`);
  for (const endpoint of undocumented)
    console.error(`- undocumented: ${endpoint}`);
  process.exit(1);
}

console.log(
  `Auth API contract ${contract.version} verified (${actual.length} endpoints).`,
);

async function controllers(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await controllers(path)));
    else if (entry.isFile() && entry.name.endsWith('.controller.ts')) {
      result.push(path);
    }
  }
  return result;
}
