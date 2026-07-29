import { Module } from '@nestjs/common';
import { SecurityEventWriter } from './security-event-writer.service';

@Module({
  providers: [SecurityEventWriter],
  exports: [SecurityEventWriter],
})
export class SecurityEventsModule {}
