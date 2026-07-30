import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PasskeyController } from './passkey.controller';
import { PasskeyService } from './passkey.service';
import { RecoveryCodeController } from './recovery-code.controller';
import { PasskeyAuthenticationController } from './passkey-authentication.controller';

@Module({
  imports: [AuthModule],
  controllers: [
    PasskeyController,
    PasskeyAuthenticationController,
    RecoveryCodeController,
  ],
  providers: [PasskeyService],
})
export class PasskeyModule {}
