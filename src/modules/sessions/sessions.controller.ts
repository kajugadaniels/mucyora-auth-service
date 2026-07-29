import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { AuthEnvironment } from '../../config/environment.validation';
import { AccessAuthGuard } from '../auth/access-auth.guard';
import type { AuthenticatedRequest } from '../auth/access-auth.guard';
import { SessionLevelGuard } from '../auth/session-level.guard';
import { SessionManagementService } from './session-management.service';

@ApiTags('sessions')
@ApiBearerAuth()
@UseGuards(AccessAuthGuard, SessionLevelGuard)
@Controller('auth')
export class SessionsController {
  constructor(
    private readonly sessions: SessionManagementService,
    private readonly config: ConfigService<AuthEnvironment, true>,
  ) {}

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the current session' })
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessions.logout(request.auth, requestContext(request));
    this.clearCookies(response);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke every active session' })
  async logoutAll(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessions.logoutAll(request.auth, requestContext(request));
    this.clearCookies(response);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List active sessions' })
  list(@Req() request: AuthenticatedRequest) {
    return this.sessions.list(request.auth);
  }

  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke one owned session' })
  revoke(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    return this.sessions.revoke(
      request.auth,
      sessionId,
      requestContext(request),
    );
  }

  private clearCookies(response: Response): void {
    const options = {
      domain: this.config.get('COOKIE_DOMAIN', { infer: true }) || undefined,
      path: '/api/v1/auth',
    };
    response.clearCookie(
      this.config.get('REFRESH_COOKIE_NAME', { infer: true }),
      options,
    );
    response.clearCookie(
      this.config.get('CSRF_COOKIE_NAME', { infer: true }),
      options,
    );
  }
}

function requestContext(request: AuthenticatedRequest) {
  return {
    correlationId:
      'correlationId' in request && typeof request.correlationId === 'string'
        ? request.correlationId
        : request.auth.jti,
    ipAddress: request.ip || request.socket.remoteAddress || 'unknown',
  };
}
