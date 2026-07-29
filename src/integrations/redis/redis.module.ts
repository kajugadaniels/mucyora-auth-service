import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { AuthEnvironment } from '../../config/environment.validation';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AuthEnvironment, true>) =>
        new Redis(config.get('REDIS_URL', { infer: true }), {
          lazyConnect: true,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          connectTimeout: config.get('CITIZEN_API_CONNECT_TIMEOUT_MS', {
            infer: true,
          }),
        }),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
