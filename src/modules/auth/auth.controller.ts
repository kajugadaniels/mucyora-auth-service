import { timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import type { CorrelatedRequest } from '../../common/middleware/correlation-id.middleware';
import { KeyedDigestService } from '../../common/security/keyed-digest.service';
import { AuthEnvironment } from '../../config/environment.validation';
import { AuthenticationService } from './authentication.service';
import {
  AuthTokenResponseDto,
  LoginDto,
  RefreshDto,
  TokenTransport,
} from './dto/auth.dto';

@ApiTags('authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authentication: AuthenticationService,
    private readonly config: ConfigService<AuthEnvironment, true>,
    private readonly digests: KeyedDigestService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Authenticate and create a limited or full session',
  })
  @ApiOkResponse({ type: AuthTokenResponseDto })
  async login(
    @Body() input: LoginDto,
    @Req() request: CorrelatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokenResponseDto> {
    const issued = await this.authentication.login(
      input,
      requestContext(request),
    );
    this.applyTransport(response, issued);
    return issued.response;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate a refresh token and issue new credentials' })
  @ApiOkResponse({ type: AuthTokenResponseDto })
  async refresh(
    @Body() input: RefreshDto,
    @Req() request: CorrelatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokenResponseDto> {
    const refreshToken = this.readRefreshToken(input, request);
    const issued = await this.authentication.refresh(
      refreshToken,
      input.transport,
      requestContext(request),
    );
    this.applyTransport(response, issued);
    return issued.response;
  }

  private readRefreshToken(input: RefreshDto, request: Request): string {
    if (input.transport === TokenTransport.NATIVE) {
      if (!input.refreshToken) {
        throw this.invalidRefresh();
      }
      return input.refreshToken;
    }
    if (input.refreshToken) {
      throw this.invalidRefresh();
    }
    const cookies = (request.cookies ?? {}) as Record<
      string,
      string | undefined
    >;
    const refreshToken =
      cookies[this.config.get('REFRESH_COOKIE_NAME', { infer: true })];
    const csrfCookie =
      cookies[this.config.get('CSRF_COOKIE_NAME', { infer: true })];
    const csrfHeader = request.header('x-csrf-token');
    if (
      !refreshToken ||
      !csrfCookie ||
      !csrfHeader ||
      !constantTimeEqual(csrfCookie, csrfHeader) ||
      !constantTimeEqual(csrfCookie, this.digests.requestContext(refreshToken))
    ) {
      throw this.invalidRefresh();
    }
    return refreshToken;
  }

  private applyTransport(
    response: Response,
    issued: Awaited<ReturnType<AuthenticationService['login']>>,
  ): void {
    if (issued.transport !== TokenTransport.COOKIE) {
      return;
    }
    const base = {
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: this.config.get('COOKIE_SAME_SITE', { infer: true }),
      domain: this.config.get('COOKIE_DOMAIN', { infer: true }) || undefined,
      path: '/api/v1/auth',
    } as const;
    response.cookie(
      this.config.get('REFRESH_COOKIE_NAME', { infer: true }),
      issued.refreshToken,
      {
        ...base,
        httpOnly: true,
        maxAge:
          this.config.get('REFRESH_TOKEN_TTL_SECONDS', { infer: true }) * 1_000,
      },
    );
    response.cookie(
      this.config.get('CSRF_COOKIE_NAME', { infer: true }),
      issued.csrfToken,
      {
        ...base,
        httpOnly: false,
        maxAge:
          this.config.get('REFRESH_TOKEN_TTL_SECONDS', { infer: true }) * 1_000,
      },
    );
  }

  private invalidRefresh(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'REFRESH_TOKEN_INVALID',
      message: 'The refresh token is invalid or unavailable.',
    });
  }
}

function requestContext(request: CorrelatedRequest) {
  return {
    correlationId: request.correlationId,
    ipAddress: request.ip || request.socket.remoteAddress || 'unknown',
    userAgent: request.header('user-agent') ?? 'unknown',
  };
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
