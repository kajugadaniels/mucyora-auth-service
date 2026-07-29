import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { AuthModule } from '../auth/auth.module';
import { PasswordController } from './password.controller';
import { PasswordRateLimiter } from './password-rate-limiter.service';
import { PasswordService } from './password.service';

@Module({
  imports: [AuthModule, IntegrationsModule],
  controllers: [PasswordController],
  providers: [PasswordRateLimiter, PasswordService],
})
export class PasswordModule {}
