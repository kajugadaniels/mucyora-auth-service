import http from 'node:http';
import https from 'node:https';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthEnvironment } from '../../config/environment.validation';
import { EngineService } from './engine.service';

@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AuthEnvironment, true>) => ({
        baseURL: config.get('MUCYORA_ENGINE_URL', { infer: true }),
        timeout: config.get('MUCYORA_ENGINE_TIMEOUT_MS', { infer: true }),
        maxRedirects: 0,
        httpAgent: new http.Agent({ keepAlive: true, maxSockets: 32 }),
        httpsAgent: new https.Agent({
          keepAlive: true,
          maxSockets: 32,
          rejectUnauthorized: true,
        }),
      }),
    }),
  ],
  providers: [EngineService],
  exports: [EngineService],
})
export class EngineModule {}
