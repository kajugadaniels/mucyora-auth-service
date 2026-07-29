import { Module } from '@nestjs/common';
import { CitizenApiModule } from './citizen-api/citizen-api.module';
import { RedisModule } from './redis/redis.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [RedisModule, CitizenApiModule, MailModule],
  exports: [RedisModule, CitizenApiModule, MailModule],
})
export class IntegrationsModule {}
