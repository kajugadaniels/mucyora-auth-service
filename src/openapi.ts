import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export const AUTH_API_VERSION = '1.0.0';

export function createAuthOpenApiDocument(
  app: INestApplication,
): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('MUCYORA Auth Service')
    .setDescription(
      'Versioned authentication and identity-verification API. All people and identifiers in examples are fictional Rwandan test data.',
    )
    .setVersion(AUTH_API_VERSION)
    .addServer('/api/v1', 'Version 1 public and internal API')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .addCookieAuth(
      'mucyora_refresh',
      {
        type: 'apiKey',
        in: 'cookie',
        description: 'HttpOnly browser refresh-token cookie.',
      },
      'refreshCookie',
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'x-csrf-token',
        description:
          'Double-submit CSRF value required with cookie refresh transport.',
      },
      'csrf',
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'x-mucyora-service-name',
        description: 'Approved internal MUCYORA service identity.',
      },
      'internalServiceName',
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'x-mucyora-service-key',
        description: 'Purpose-separated internal service credential.',
      },
      'internalServiceKey',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    deepScanRoutes: true,
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });
  return enrichAuthOpenApiDocument(document);
}

export function setupAuthSwagger(
  app: INestApplication,
  document = createAuthOpenApiDocument(app),
): void {
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    swaggerOptions: {
      displayOperationId: true,
      persistAuthorization: false,
    },
  });
}

function enrichAuthOpenApiDocument(document: OpenAPIObject): OpenAPIObject {
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const operation = pathItem?.[method];
      if (!operation) continue;
      operation.deprecated ??= false;
      operation.parameters ??= [];
      if (
        !operation.parameters.some(
          (parameter) =>
            'name' in parameter && parameter.name === 'x-correlation-id',
        )
      ) {
        operation.parameters.push({
          name: 'x-correlation-id',
          in: 'header',
          required: false,
          description:
            'Optional validated correlation ID returned on the response.',
          schema: {
            type: 'string',
            example: 'kigali-mobile-20260730-0001',
          },
        });
      }
      operation.responses['400'] ??= errorResponse(
        'Request validation failed.',
      );
      operation.responses['429'] ??= errorResponse(
        'A security rate limit was enforced.',
      );
      operation.responses['500'] ??= errorResponse(
        'Unexpected failure with a minimized response.',
      );
      operation.responses['503'] ??= errorResponse(
        'A required dependency is temporarily unavailable.',
      );
      for (const [status, response] of Object.entries(operation.responses)) {
        if (
          !response ||
          !/^2\d\d$/.test(status) ||
          status === '204' ||
          '$ref' in response
        ) {
          continue;
        }
        response.headers ??= {};
        response.headers['x-correlation-id'] ??= {
          description: 'Validated or generated request correlation ID.',
          schema: {
            type: 'string',
            example: 'kigali-mobile-20260730-0001',
          },
        };
        response.content ??= {
          'application/json': {
            schema: {
              type: 'object',
              description:
                'Endpoint response. Typed DTO schemas are used where the response is not provider-generated.',
              additionalProperties: true,
            },
          },
        };
      }

      if (path.startsWith('/api/v1/internal/')) {
        operation.security = [
          { internalServiceName: [], internalServiceKey: [] },
        ];
      }
      if (path === '/api/v1/auth/refresh') {
        operation.security = [{}, { refreshCookie: [], csrf: [] }];
      }
    }
  }
  return document;
}

function errorResponse(description: string) {
  return {
    description,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['code', 'message'],
          properties: {
            code: { type: 'string', example: 'REQUEST_INVALID' },
            message: {
              type: 'string',
              example: 'The request could not be completed.',
            },
            correlationId: {
              type: 'string',
              example: 'kigali-mobile-20260730-0001',
            },
            statusCode: { type: 'integer', example: 400 },
          },
        },
      },
    },
  };
}
