import { Module } from '@nestjs/common';
import { CitizenApiModule } from './citizen-api/citizen-api.module';

@Module({
  imports: [CitizenApiModule],
  exports: [CitizenApiModule],
})
export class IntegrationsModule {}
