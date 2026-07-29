import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import http from 'node:http';
import https from 'node:https';

import { AuthEnvironment } from '../../config/environment.validation';
import { RedisModule } from '../redis/redis.module';
import { CITIZEN_CACHE, RedisCitizenCache } from './citizen-cache.service';
import { CitizenCircuitBreaker } from './citizen-circuit-breaker';
import { CITIZEN_IDENTITY_PROVIDER } from './citizen-identity-provider';
import { CitizenMetricsService } from './citizen-metrics.service';
import {
  CITIZEN_RETRY_DELAY,
  NidaCitizenAdapter,
  defaultCitizenRetryDelay,
} from './nida-citizen.adapter';
import { CitizenResponseMapper } from './citizen-response.mapper';

@Module({
  imports: [
    RedisModule,
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AuthEnvironment, true>) => ({
        baseURL: config.get('CITIZEN_API_URL', { infer: true }),
        timeout: config.get('CITIZEN_API_RESPONSE_TIMEOUT_MS', { infer: true }),
        maxRedirects: 0,
        httpAgent: new http.Agent({
          keepAlive: true,
          maxSockets: 50,
          timeout: config.get('CITIZEN_API_CONNECT_TIMEOUT_MS', {
            infer: true,
          }),
        }),
        httpsAgent: new https.Agent({
          keepAlive: true,
          maxSockets: 50,
          rejectUnauthorized: true,
          timeout: config.get('CITIZEN_API_CONNECT_TIMEOUT_MS', {
            infer: true,
          }),
        }),
      }),
    }),
  ],
  providers: [
    CitizenResponseMapper,
    CitizenCircuitBreaker,
    CitizenMetricsService,
    NidaCitizenAdapter,
    RedisCitizenCache,
    {
      provide: CITIZEN_CACHE,
      useExisting: RedisCitizenCache,
    },
    {
      provide: CITIZEN_RETRY_DELAY,
      useValue: defaultCitizenRetryDelay,
    },
    {
      provide: CITIZEN_IDENTITY_PROVIDER,
      useExisting: NidaCitizenAdapter,
    },
  ],
  exports: [CITIZEN_IDENTITY_PROVIDER],
})
export class CitizenApiModule {}
