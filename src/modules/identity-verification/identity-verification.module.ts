import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { AuthModule } from '../auth/auth.module';
import { IdentityVerificationController } from './identity-verification.controller';
import { IdentityVerificationService } from './identity-verification.service';
import { VerificationCleanupService } from './verification-cleanup.service';

@Module({
  imports: [AuthModule, IntegrationsModule],
  controllers: [IdentityVerificationController],
  providers: [IdentityVerificationService, VerificationCleanupService],
})
export class IdentityVerificationModule {}
