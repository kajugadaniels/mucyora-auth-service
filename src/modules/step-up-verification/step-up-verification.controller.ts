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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SessionLevel } from '@mucyora/db';

import type { CorrelatedRequest } from '../../common/middleware/correlation-id.middleware';
import { AccessAuthGuard } from '../auth/access-auth.guard';
import type { AuthenticatedRequest } from '../auth/access-auth.guard';
import {
  RequireSessionLevel,
  SessionLevelGuard,
} from '../auth/session-level.guard';
import { CreateStepUpChallengeDto } from './dto/step-up-verification.dto';
import { StepUpVerificationService } from './step-up-verification.service';

type StepUpRequest = CorrelatedRequest & AuthenticatedRequest;

@ApiTags('step-up-verification')
@ApiBearerAuth()
@UseGuards(AccessAuthGuard, SessionLevelGuard)
@RequireSessionLevel(SessionLevel.FULL)
@Controller('step-up/challenges')
export class StepUpVerificationController {
  constructor(private readonly stepUp: StepUpVerificationService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a target-bound fresh-verification challenge',
  })
  create(
    @Body() input: CreateStepUpChallengeDto,
    @Req() request: StepUpRequest,
  ) {
    return this.stepUp.createChallenge(
      request.auth,
      input,
      requestContext(request),
    );
  }

  @Get(':challengeId')
  @ApiOperation({ summary: 'Read an owned step-up challenge' })
  challenge(
    @Param('challengeId', new ParseUUIDPipe()) challengeId: string,
    @Req() request: StepUpRequest,
  ) {
    return this.stepUp.challenge(request.auth, challengeId);
  }

  @Post(':challengeId/assertion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Issue the assertion after fresh verification passes',
  })
  assertion(
    @Param('challengeId', new ParseUUIDPipe()) challengeId: string,
    @Req() request: StepUpRequest,
  ) {
    return this.stepUp.issueAssertion(
      request.auth,
      challengeId,
      requestContext(request),
    );
  }
}

function requestContext(request: StepUpRequest) {
  return {
    correlationId: request.correlationId,
    ipAddress: request.ip || request.socket.remoteAddress || 'unknown',
    userAgent: request.header('user-agent') ?? 'unknown',
  };
}
