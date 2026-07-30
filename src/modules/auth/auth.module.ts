import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { SecurityEventsModule } from '../security-events/security-events.module';
import { AccessAuthGuard } from './access-auth.guard';
import { AccessTokenService } from './access-token.service';
import { AuthController } from './auth.controller';
import { AuthRateLimiter } from './auth-rate-limiter.service';
import { AuthenticationService } from './authentication.service';
import { JwksController } from './jwks.controller';
import { SessionLevelGuard } from './session-level.guard';
import { SessionUpgradeController } from './session-upgrade.controller';
import { SessionUpgradeGuard } from './session-upgrade.guard';
import { SessionUpgradeService } from './session-upgrade.service';
import { LoginRiskService } from './login-risk.service';

@Module({
  imports: [IntegrationsModule, SecurityEventsModule],
  controllers: [AuthController, SessionUpgradeController, JwksController],
  providers: [
    AccessTokenService,
    AccessAuthGuard,
    SessionLevelGuard,
    SessionUpgradeGuard,
    AuthRateLimiter,
    AuthenticationService,
    SessionUpgradeService,
    LoginRiskService,
  ],
  exports: [AccessTokenService, AccessAuthGuard, SessionLevelGuard],
})
export class AuthModule {}
