import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const forbiddenPaths = [
  'prisma',
  'prisma.config.ts',
  'src/generated/prisma',
  'src/modules/admin',
  'src/modules/devices',
  'src/modules/payments',
  'src/modules/signatures',
];
const forbiddenPackages = ['@prisma/client', 'prisma'];

const violations = [];

for (const path of forbiddenPaths) {
  if (await pathExists(join(projectRoot, path))) {
    violations.push(`forbidden Auth-owned path: ${path}`);
  }
}

const packageJson = JSON.parse(
  await readFile(join(projectRoot, 'package.json'), 'utf8'),
);
const dependencies = {
  ...packageJson.dependencies,
  ...packageJson.devDependencies,
};

for (const packageName of forbiddenPackages) {
  if (dependencies[packageName]) {
    violations.push(`forbidden direct dependency: ${packageName}`);
  }
}

for (const file of await collectFiles(join(projectRoot, 'src'))) {
  const content = await readFile(file, 'utf8');
  if (
    /from\s+['"]@prisma\/client['"]|require\(['"]@prisma\/client['"]\)/.test(
      content,
    )
  ) {
    violations.push(
      `direct Prisma client import: ${relative(projectRoot, file)}`,
    );
  }
}

if (violations.length > 0) {
  console.error('Auth project boundary check failed:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('Auth project boundary check passed.');

async function pathExists(path) {
  try {
    await readdir(path);
    return true;
  } catch {
    try {
      await readFile(path);
      return true;
    } catch {
      return false;
    }
  }
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(path);
    }
  }

  return files;
}

