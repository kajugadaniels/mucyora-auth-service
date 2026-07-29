import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { SecurityEventsModule } from '../security-events/security-events.module';
import { AccountCreationRateLimiter } from './account-creation-rate-limiter.service';
import { CitizenLookupRateLimiter } from './citizen-lookup-rate-limiter.service';
import { CitizenLookupService } from './citizen-lookup.service';
import { RegistrationChallengeLifecycleService } from './registration-challenge-lifecycle.service';
import { RegistrationChallengeTokenService } from './registration-challenge-token.service';
import { RegistrationController } from './registration.controller';
import { RegistrationService } from './registration.service';

@Module({
  imports: [IntegrationsModule, SecurityEventsModule],
  controllers: [RegistrationController],
  providers: [
    CitizenLookupRateLimiter,
    CitizenLookupService,
    AccountCreationRateLimiter,
    RegistrationChallengeLifecycleService,
    RegistrationChallengeTokenService,
    RegistrationService,
  ],
  exports: [
    RegistrationChallengeLifecycleService,
    RegistrationChallengeTokenService,
    AccountCreationRateLimiter,
  ],
})
export class RegistrationModule {}
