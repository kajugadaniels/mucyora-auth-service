import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import type { CorrelatedRequest } from '../../common/middleware/correlation-id.middleware';
import { AccessAuthGuard } from '../auth/access-auth.guard';
import type { AuthenticatedRequest } from '../auth/access-auth.guard';
import { SessionLevelGuard } from '../auth/session-level.guard';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  PasswordChangedDto,
  PasswordRequestAcceptedDto,
  ResetPasswordDto,
} from './dto/password.dto';
import { PasswordService } from './password.service';

@ApiTags('password')
@Controller('auth/password')
export class PasswordController {
  constructor(private readonly passwords: PasswordService) {}

  @Post('forgot')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a generic password recovery email' })
  @ApiOkResponse({ type: PasswordRequestAcceptedDto })
  forgot(
    @Body() input: ForgotPasswordDto,
    @Req() request: CorrelatedRequest,
  ): Promise<PasswordRequestAcceptedDto> {
    return this.passwords.forgot(input, requestContext(request));
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consume a password recovery token' })
  @ApiOkResponse({ type: PasswordChangedDto })
  reset(
    @Body() input: ResetPasswordDto,
    @Req() request: CorrelatedRequest,
  ): Promise<PasswordChangedDto> {
    return this.passwords.reset(input, requestContext(request));
  }

  @Post('change')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(AccessAuthGuard, SessionLevelGuard)
  @ApiOperation({ summary: 'Change a password using the current password' })
  @ApiOkResponse({ type: PasswordChangedDto })
  change(
    @Body() input: ChangePasswordDto,
    @Req() request: AuthenticatedRequest & CorrelatedRequest,
  ): Promise<PasswordChangedDto> {
    return this.passwords.change(request.auth, input, requestContext(request));
  }
}

function requestContext(request: Request & Partial<CorrelatedRequest>) {
  return {
    correlationId: request.correlationId ?? 'password-request',
    ipAddress: request.ip || request.socket.remoteAddress || 'unknown',
    userAgent: request.header('user-agent') ?? 'unknown',
  };
}
