import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SessionManagementService } from './session-management.service';
import { SessionsController } from './sessions.controller';

@Module({
  imports: [AuthModule],
  controllers: [SessionsController],
  providers: [SessionManagementService],
})
export class SessionsModule {}
