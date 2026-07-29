import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ConsumeStepUpAssertionDto } from './dto/step-up-verification.dto';
import { InternalServiceGuard } from './internal-service.guard';
import type { InternalServiceRequest } from './internal-service.guard';
import { StepUpVerificationService } from './step-up-verification.service';

@ApiTags('internal-step-up-verification')
@UseGuards(InternalServiceGuard)
@Controller('internal/step-up/assertions')
export class InternalStepUpController {
  constructor(private readonly stepUp: StepUpVerificationService) {}

  @Post('consume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consume one purpose- and target-bound assertion' })
  consume(
    @Body() input: ConsumeStepUpAssertionDto,
    @Req() request: InternalServiceRequest,
  ) {
    return this.stepUp.consumeAssertion(request.internalService, input);
  }
}
