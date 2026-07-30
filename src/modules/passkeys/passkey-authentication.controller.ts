import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';

import { AuthEnvironment } from '../../config/environment.validation';
import { TokenTransport } from '../auth/dto/auth.dto';
import {
  PasskeyAuthenticationOptionsDto,
  PasskeyAuthenticationVerifyDto,
} from './dto/passkey.dto';
import { PasskeyService } from './passkey.service';

@ApiTags('passkeys-and-recovery')
@Controller('auth/passkeys/authentication')
export class PasskeyAuthenticationController {
  constructor(
    private readonly passkeys: PasskeyService,
    private readonly config: ConfigService<AuthEnvironment, true>,
  ) {}

  @Post('options')
  @ApiOperation({ summary: 'Create generic passkey authentication options' })
  options(@Body() input: PasskeyAuthenticationOptionsDto) {
    return this.passkeys.authenticationOptions(input);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a passkey and create an Auth session' })
  async verify(
    @Body() input: PasskeyAuthenticationVerifyDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const issued = await this.passkeys.verifyAuthentication(input, {
      ipAddress: request.ip || request.socket.remoteAddress || 'unknown',
      userAgent: request.header('user-agent') ?? 'unknown',
    });
    if (issued.transport === TokenTransport.COOKIE) {
      const options = {
        secure: this.config.get('COOKIE_SECURE', { infer: true }),
        sameSite: this.config.get('COOKIE_SAME_SITE', { infer: true }),
        domain: this.config.get('COOKIE_DOMAIN', { infer: true }) || undefined,
        path: '/api/v1/auth',
        maxAge:
          this.config.get('REFRESH_TOKEN_TTL_SECONDS', { infer: true }) * 1_000,
      } as const;
      response.cookie(
        this.config.get('REFRESH_COOKIE_NAME', { infer: true }),
        issued.refreshToken,
        { ...options, httpOnly: true },
      );
      response.cookie(
        this.config.get('CSRF_COOKIE_NAME', { infer: true }),
        issued.csrfToken,
        { ...options, httpOnly: false },
      );
    }
    return issued.response;
  }
}
