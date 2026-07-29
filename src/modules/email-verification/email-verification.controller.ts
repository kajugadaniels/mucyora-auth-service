import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { CorrelatedRequest } from '../../common/middleware/correlation-id.middleware';
import {
  ResendEmailVerificationDto,
  ResendEmailVerificationResponseDto,
  VerifyEmailDto,
  VerifyEmailResponseDto,
} from './dto/email-verification.dto';
import { EmailVerificationService } from './email-verification.service';

@ApiTags('registration')
@Controller('registration/email')
export class EmailVerificationController {
  constructor(private readonly emailVerification: EmailVerificationService) {}

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consume a single-use email verification token' })
  @ApiOkResponse({ type: VerifyEmailResponseDto })
  verify(
    @Body() input: VerifyEmailDto,
    @Req() request: CorrelatedRequest,
  ): Promise<VerifyEmailResponseDto> {
    return this.emailVerification.verify(input, requestContext(request));
  }

  @Post('resend')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request another email verification message' })
  @ApiAcceptedResponse({ type: ResendEmailVerificationResponseDto })
  resend(
    @Body() input: ResendEmailVerificationDto,
    @Req() request: CorrelatedRequest,
  ): Promise<ResendEmailVerificationResponseDto> {
    return this.emailVerification.resend(input, requestContext(request));
  }
}

function requestContext(request: CorrelatedRequest): {
  correlationId: string;
  ipAddress: string;
} {
  return {
    correlationId: request.correlationId,
    ipAddress: request.ip || request.socket.remoteAddress || 'unknown',
  };
}
