import { INestApplication, RequestMethod } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { OpenAPIObject } from '@nestjs/swagger';

import { AppModule } from '../src/app.module';
import { AUTH_API_VERSION, createAuthOpenApiDocument } from '../src/openapi';

describe('OpenAPI contract (e2e)', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1', {
      exclude: [
        { path: 'health/live', method: RequestMethod.GET },
        { path: 'health/ready', method: RequestMethod.GET },
        { path: '.well-known/jwks.json', method: RequestMethod.GET },
      ],
    });
    document = createAuthOpenApiDocument(app);
  });

  it('documents every operation with stable versioned release metadata', () => {
    const operations = collectOperations(document);
    expect(document.info.version).toBe(AUTH_API_VERSION);
    expect(operations).toHaveLength(29);
    for (const operation of operations) {
      expect(operation.operationId).toMatch(/^[A-Za-z]+_[A-Za-z]+$/);
      expect(operation.summary).toBeTruthy();
      expect(operation.deprecated).toBe(false);
      expect(Object.keys(operation.responses)).toEqual(
        expect.arrayContaining(['400', '429', '500', '503']),
      );
      expect(
        Object.keys(operation.responses).some((status) =>
          /^2\d\d$/.test(status),
        ),
      ).toBe(true);
      for (const [status, response] of Object.entries(operation.responses)) {
        if (/^2\d\d$/.test(status) && status !== '204') {
          expect(hasJsonSchema(response)).toBe(true);
        }
      }
    }
  });

  it('publishes all authentication schemes and fictional Rwandan examples', () => {
    expect(Object.keys(document.components?.securitySchemes ?? {})).toEqual(
      expect.arrayContaining([
        'bearer',
        'refreshCookie',
        'csrf',
        'internalServiceName',
        'internalServiceKey',
      ]),
    );
    const serialized = JSON.stringify(document);
    expect(serialized).toContain('Aline');
    expect(serialized).toContain('Uwase');
    expect(serialized).toContain('aline.uwase@example.rw');
    expect(serialized).toContain('1199980012345678');
    expect(serialized).not.toMatch(
      /user@example\.com|Example Citizen|John Doe|Jane Doe/i,
    );
  });

  afterAll(async () => {
    await app.close();
  });
});

interface DocumentedOperation {
  operationId: string;
  summary: string;
  deprecated: boolean;
  responses: Record<string, unknown>;
}

function hasJsonSchema(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const response = value as Record<string, unknown>;
  const content = response.content;
  if (!content || typeof content !== 'object') return false;
  const json = (content as Record<string, unknown>)['application/json'];
  return Boolean(
    json &&
    typeof json === 'object' &&
    'schema' in (json as Record<string, unknown>),
  );
}

function collectOperations(document: OpenAPIObject): DocumentedOperation[] {
  const operations: DocumentedOperation[] = [];
  const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;
  for (const path of Object.values(document.paths)) {
    if (!path) continue;
    for (const method of methods) {
      const operation = path[method];
      if (
        operation?.operationId &&
        operation.summary &&
        typeof operation.deprecated === 'boolean'
      ) {
        operations.push({
          operationId: operation.operationId,
          summary: operation.summary,
          deprecated: operation.deprecated,
          responses: operation.responses,
        });
      }
    }
  }
  return operations;
}
