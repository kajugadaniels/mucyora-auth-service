import { Module } from '@nestjs/common';
import { MailModule } from '../../integrations/mail/mail.module';
import { RegistrationModule } from '../registration/registration.module';
import { EmailVerificationController } from './email-verification.controller';
import { EmailVerificationService } from './email-verification.service';

@Module({
  imports: [RegistrationModule, MailModule],
  controllers: [EmailVerificationController],
  providers: [EmailVerificationService],
})
export class EmailVerificationModule {}
