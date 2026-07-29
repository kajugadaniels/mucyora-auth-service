import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { SecurityEventsModule } from '../security-events/security-events.module';
import { CitizenLookupRateLimiter } from './citizen-lookup-rate-limiter.service';
import { CitizenLookupService } from './citizen-lookup.service';
import { RegistrationChallengeLifecycleService } from './registration-challenge-lifecycle.service';
import { RegistrationChallengeTokenService } from './registration-challenge-token.service';
import { RegistrationController } from './registration.controller';

@Module({
  imports: [IntegrationsModule, SecurityEventsModule],
  controllers: [RegistrationController],
  providers: [
    CitizenLookupRateLimiter,
    CitizenLookupService,
    RegistrationChallengeLifecycleService,
    RegistrationChallengeTokenService,
  ],
  exports: [
    RegistrationChallengeLifecycleService,
    RegistrationChallengeTokenService,
  ],
})
export class RegistrationModule {}
