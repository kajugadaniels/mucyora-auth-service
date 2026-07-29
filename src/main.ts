import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const AUTH_SERVICE_PORT = 3000;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(AUTH_SERVICE_PORT);
}

void bootstrap();
