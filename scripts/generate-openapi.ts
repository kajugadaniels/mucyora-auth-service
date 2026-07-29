import '../test/setup-env';

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';

import { AppModule } from '../src/app.module';
import { createAuthOpenApiDocument } from '../src/openapi';

const outputPath = resolve(process.cwd(), 'contracts/openapi.json');

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
      { path: '.well-known/jwks.json', method: RequestMethod.GET },
    ],
  });

  try {
    const serialized = `${JSON.stringify(
      sortObject(createAuthOpenApiDocument(app)),
      null,
      2,
    )}\n`;
    if (process.argv.includes('--check')) {
      const committed = await readFile(outputPath, 'utf8');
      if (committed !== serialized) {
        throw new Error(
          'OpenAPI artifact is stale. Run npm run openapi:generate and commit contracts/openapi.json.',
        );
      }
      console.log('Committed OpenAPI artifact matches application metadata.');
    } else {
      await writeFile(outputPath, serialized, 'utf8');
      console.log(`Wrote ${outputPath}`);
    }
  } finally {
    await app.close();
  }
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortObject(item)]),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
