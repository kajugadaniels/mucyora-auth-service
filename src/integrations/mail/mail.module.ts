import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { RedisModule } from '../redis/redis.module';
import { HttpMailAdapter } from './http-mail.adapter';
import { MailOutboxWorker } from './mail-outbox.worker';
import { MAIL_PROVIDER } from './mail-provider';
import { MailTemplateService } from './mail-template.service';

@Module({
  imports: [HttpModule, RedisModule],
  providers: [
    HttpMailAdapter,
    MailTemplateService,
    MailOutboxWorker,
    {
      provide: MAIL_PROVIDER,
      useExisting: HttpMailAdapter,
    },
  ],
  exports: [MailOutboxWorker, MailTemplateService],
})
export class MailModule {}
