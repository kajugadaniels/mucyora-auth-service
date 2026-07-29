import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { RegistrationModule } from './modules/registration/registration.module';
import { IdentityVerificationModule } from './modules/identity-verification/identity-verification.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { PasswordModule } from './modules/password/password.module';
import { OtpModule } from './modules/otp/otp.module';
import { HealthModule } from './modules/health/health.module';
import { CommonModule } from './common/common.module';

@Module({
  imports: [AuthModule, RegistrationModule, IdentityVerificationModule, SessionsModule, PasswordModule, OtpModule, HealthModule, CommonModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
