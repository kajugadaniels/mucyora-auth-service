import { Module } from '@nestjs/common';
import { CitizenApiModule } from './citizen-api/citizen-api.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [RedisModule, CitizenApiModule],
  exports: [RedisModule, CitizenApiModule],
})
export class IntegrationsModule {}
