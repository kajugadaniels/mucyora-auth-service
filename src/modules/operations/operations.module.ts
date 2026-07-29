import { Module } from '@nestjs/common';

import { StepUpVerificationModule } from '../step-up-verification/step-up-verification.module';
import { OperationalJobsService } from './operational-jobs.service';
import { OperationsController } from './operations.controller';

@Module({
  imports: [StepUpVerificationModule],
  controllers: [OperationsController],
  providers: [OperationalJobsService],
  exports: [OperationalJobsService],
})
export class OperationsModule {}
