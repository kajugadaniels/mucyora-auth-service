import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { CommonModule } from './common/common.module';
import { validateEnvironment } from './config/environment.validation';
import { IntegrationsModule } from './integrations/integrations.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AuthModule } from './modules/auth/auth.module';
import { EmailVerificationModule } from './modules/email-verification/email-verification.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityVerificationModule } from './modules/identity-verification/identity-verification.module';
import { InternalModule } from './modules/internal/internal.module';
import { OtpModule } from './modules/otp/otp.module';
import { PasswordModule } from './modules/password/password.module';
import { RegistrationModule } from './modules/registration/registration.module';
import { SecurityEventsModule } from './modules/security-events/security-events.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { StepUpVerificationModule } from './modules/step-up-verification/step-up-verification.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    IntegrationsModule,
    AccountsModule,
    AuthModule,
    EmailVerificationModule,
    RegistrationModule,
    IdentityVerificationModule,
    InternalModule,
    SessionsModule,
    PasswordModule,
    OtpModule,
    SecurityEventsModule,
    StepUpVerificationModule,
    HealthModule,
    CommonModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(CorrelationIdMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
