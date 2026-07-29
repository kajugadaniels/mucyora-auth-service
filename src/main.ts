import { LogLevel, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { JsonLogger } from './common/logging/json.logger';
import { buildCorsOptions } from './common/security/cors.config';
import { createDocsBasicAuthMiddleware } from './common/security/docs-basic-auth.middleware';

const AUTH_SERVICE_PORT = 3000;
const REQUEST_BODY_LIMIT = '256kb';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: new JsonLogger(resolveBootstrapLogLevel(process.env.LOG_LEVEL)),
  });
  const config = app.get(ConfigService);
  const environment = config.getOrThrow<string>('APP_ENV');

  app.useLogger(new JsonLogger(config.getOrThrow<LogLevel>('LOG_LEVEL')));
  app.enableShutdownHooks();
  app.use(helmet());
  app.use(cookieParser());
  app.use(json({ limit: REQUEST_BODY_LIMIT }));
  app.use(urlencoded({ extended: false, limit: REQUEST_BODY_LIMIT }));
  app.enableCors(
    buildCorsOptions(config.getOrThrow<string>('CORS_ALLOWED_ORIGINS')),
  );
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
      { path: '.well-known/jwks.json', method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  configureSwagger(app, config, environment);
  await app.listen(AUTH_SERVICE_PORT);
}

function configureSwagger(
  app: Awaited<ReturnType<typeof NestFactory.create>>,
  config: ConfigService,
  environment: string,
): void {
  if (!config.getOrThrow<boolean>('ENABLE_SWAGGER')) {
    return;
  }

  if (environment === 'production') {
    const protectDocs = createDocsBasicAuthMiddleware(
      config.getOrThrow<string>('DOCS_BASIC_AUTH_USER'),
      config.getOrThrow<string>('DOCS_BASIC_AUTH_PASS'),
    );
    app.use('/api/docs', protectDocs);
    app.use('/api/docs-json', protectDocs);
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('MUCYORA Auth Service')
    .setDescription(
      'Authentication and identity-verification orchestration API',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );
}

function resolveBootstrapLogLevel(value?: string): LogLevel {
  const levels: LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];
  return levels.includes(value as LogLevel) ? (value as LogLevel) : 'log';
}

bootstrap().catch((error: unknown) => {
  const logger = new JsonLogger('error');
  logger.error(
    error instanceof Error
      ? { name: error.name, message: error.message }
      : 'Auth bootstrap failed',
  );
  process.exitCode = 1;
});
