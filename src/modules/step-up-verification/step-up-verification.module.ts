import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InternalServiceGuard } from './internal-service.guard';
import { InternalStepUpController } from './internal-step-up.controller';
import { StepUpVerificationController } from './step-up-verification.controller';
import { StepUpVerificationService } from './step-up-verification.service';

@Module({
  imports: [AuthModule],
  controllers: [StepUpVerificationController, InternalStepUpController],
  providers: [StepUpVerificationService, InternalServiceGuard],
})
export class StepUpVerificationModule {}
