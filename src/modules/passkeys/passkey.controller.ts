import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AccessAuthGuard } from '../auth/access-auth.guard';
import type { AuthenticatedRequest } from '../auth/access-auth.guard';
import { SessionLevelGuard } from '../auth/session-level.guard';
import {
  PasskeyRegistrationOptionsDto,
  PasskeyRegistrationVerifyDto,
} from './dto/passkey.dto';
import { PasskeyService } from './passkey.service';

@ApiTags('passkeys-and-recovery')
@ApiBearerAuth()
@UseGuards(AccessAuthGuard, SessionLevelGuard)
@Controller('auth/passkeys')
export class PasskeyController {
  constructor(private readonly passkeys: PasskeyService) {}

  @Post('registration/options')
  @ApiOperation({ summary: 'Create passkey registration options' })
  options(
    @Req() request: AuthenticatedRequest,
    @Body() input: PasskeyRegistrationOptionsDto,
  ) {
    return this.passkeys.registrationOptions(request.auth, input);
  }

  @Post('registration/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify and store a passkey credential' })
  verify(
    @Req() request: AuthenticatedRequest,
    @Body() input: PasskeyRegistrationVerifyDto,
  ) {
    return this.passkeys.verifyRegistration(request.auth, input);
  }

  @Get()
  @ApiOperation({ summary: 'List active passkey credentials' })
  list(@Req() request: AuthenticatedRequest) {
    return this.passkeys.list(request.auth);
  }

  @Delete(':credentialId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke one owned passkey credential' })
  async revoke(
    @Req() request: AuthenticatedRequest,
    @Param('credentialId', ParseUUIDPipe) credentialId: string,
  ): Promise<void> {
    await this.passkeys.revoke(request.auth, credentialId);
  }

  @Post('recovery-codes')
  @ApiOperation({ summary: 'Rotate single-use account recovery codes' })
  recoveryCodes(@Req() request: AuthenticatedRequest) {
    return this.passkeys.rotateRecoveryCodes(request.auth);
  }
}
