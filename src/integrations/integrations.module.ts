import { Module } from '@nestjs/common';
import { CitizenApiModule } from './citizen-api/citizen-api.module';
import { RedisModule } from './redis/redis.module';
import { MailModule } from './mail/mail.module';
import { EngineModule } from './engine/engine.module';
import { VerificationStorageModule } from './verification-storage/verification-storage.module';

@Module({
  imports: [
    RedisModule,
    CitizenApiModule,
    MailModule,
    EngineModule,
    VerificationStorageModule,
  ],
  exports: [
    RedisModule,
    CitizenApiModule,
    MailModule,
    EngineModule,
    VerificationStorageModule,
  ],
})
export class IntegrationsModule {}
