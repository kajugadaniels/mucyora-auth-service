import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import type { CorrelatedRequest } from '../../common/middleware/correlation-id.middleware';
import { AuthEnvironment } from '../../config/environment.validation';
import type { AuthenticatedRequest } from './access-auth.guard';
import { AuthTokenResponseDto, TokenTransport } from './dto/auth.dto';
import { SessionUpgradeDto } from './dto/session-upgrade.dto';
import { SessionUpgradeGuard } from './session-upgrade.guard';
import { SessionUpgradeService } from './session-upgrade.service';

@ApiTags('authentication')
@ApiBearerAuth()
@Controller('auth/session')
export class SessionUpgradeController {
  constructor(
    private readonly upgrades: SessionUpgradeService,
    private readonly config: ConfigService<AuthEnvironment, true>,
  ) {}

  @Post('upgrade')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionUpgradeGuard)
  @ApiOperation({ summary: 'Replace a limited session with a full session' })
  @ApiHeader({
    name: 'idempotency-key',
    required: true,
    description: 'Stable retry key for one session-upgrade request.',
    example: 'session-upgrade-kigali-0001',
  })
  @ApiOkResponse({ type: AuthTokenResponseDto })
  async upgrade(
    @Body() input: SessionUpgradeDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: CorrelatedRequest & AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokenResponseDto> {
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'A valid Idempotency-Key header is required.',
      });
    }

    const issued = await this.upgrades.upgrade(
      request.auth,
      input,
      idempotencyKey,
      {
        correlationId: request.correlationId,
        ipAddress: request.ip || request.socket.remoteAddress || 'unknown',
        userAgent: request.header('user-agent') ?? 'unknown',
      },
    );
    if (issued.transport === TokenTransport.COOKIE) {
      const base = {
        secure: this.config.get('COOKIE_SECURE', { infer: true }),
        sameSite: this.config.get('COOKIE_SAME_SITE', { infer: true }),
        domain: this.config.get('COOKIE_DOMAIN', { infer: true }) || undefined,
        path: '/api/v1/auth',
      } as const;
      const maxAge =
        this.config.get('REFRESH_TOKEN_TTL_SECONDS', { infer: true }) * 1_000;
      response.cookie(
        this.config.get('REFRESH_COOKIE_NAME', { infer: true }),
        issued.refreshToken,
        { ...base, httpOnly: true, maxAge },
      );
      response.cookie(
        this.config.get('CSRF_COOKIE_NAME', { infer: true }),
        issued.csrfToken,
        { ...base, httpOnly: false, maxAge },
      );
    }
    return issued.response;
  }
}
