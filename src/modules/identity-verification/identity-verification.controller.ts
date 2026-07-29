import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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

import type { CorrelatedRequest } from '../../common/middleware/correlation-id.middleware';
import { AccessAuthGuard } from '../auth/access-auth.guard';
import type { AuthenticatedRequest } from '../auth/access-auth.guard';
import { SessionLevelGuard } from '../auth/session-level.guard';
import {
  ConfirmUploadDto,
  CreateUploadPolicyDto,
  VerificationAttemptResponseDto,
} from './dto/identity-verification.dto';
import { IdentityVerificationService } from './identity-verification.service';

type VerificationRequest = AuthenticatedRequest & CorrelatedRequest;

@ApiTags('identity-verification')
@ApiBearerAuth()
@UseGuards(AccessAuthGuard, SessionLevelGuard)
@Controller('identity-verification')
export class IdentityVerificationController {
  constructor(private readonly verification: IdentityVerificationService) {}

  @Post('attempts')
  @ApiOperation({ summary: 'Create an account-enrollment attempt' })
  @ApiOkResponse({ type: VerificationAttemptResponseDto })
  createAttempt(@Req() request: VerificationRequest) {
    return this.verification.createAttempt(
      request.auth,
      requestContext(request),
    );
  }

  @Post('attempts/:attemptId/upload-policy')
  @ApiOperation({ summary: 'Create a private attempt-bound upload policy' })
  createUploadPolicy(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Body() input: CreateUploadPolicyDto,
    @Req() request: VerificationRequest,
  ) {
    return this.verification.createUploadPolicy(request.auth, attemptId, input);
  }

  @Post('attempts/:attemptId/media/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm uploaded verification media metadata' })
  confirmUpload(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Body() input: ConfirmUploadDto,
    @Req() request: VerificationRequest,
  ) {
    return this.verification.confirmUpload(request.auth, attemptId, input);
  }

  @Post('attempts/:attemptId/liveness-session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a provider-backed liveness session' })
  createLivenessSession(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Req() request: VerificationRequest,
  ) {
    return this.verification.createLivenessSession(request.auth, attemptId);
  }

  @Post('attempts/:attemptId/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit a completed attempt to MUCYORA Engine' })
  @ApiOkResponse({ type: VerificationAttemptResponseDto })
  submit(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Req() request: VerificationRequest,
  ) {
    return this.verification.submit(
      request.auth,
      attemptId,
      requestContext(request),
    );
  }

  @Get('status')
  @ApiOperation({ summary: 'Get account identity-verification status' })
  status(@Req() request: VerificationRequest) {
    return this.verification.status(request.auth);
  }

  @Get('attempts/:attemptId')
  @ApiOperation({ summary: 'Get one owned verification attempt' })
  @ApiOkResponse({ type: VerificationAttemptResponseDto })
  attempt(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Req() request: VerificationRequest,
  ) {
    return this.verification.attempt(request.auth, attemptId);
  }
}

function requestContext(request: VerificationRequest) {
  return {
    correlationId: request.correlationId,
    ipAddress: request.ip || request.socket.remoteAddress || 'unknown',
    userAgent: request.header('user-agent') ?? 'unknown',
  };
}
