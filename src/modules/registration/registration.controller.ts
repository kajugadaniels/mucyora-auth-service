import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';

import type { CorrelatedRequest } from '../../common/middleware/correlation-id.middleware';
import { CitizenLookupService } from './citizen-lookup.service';
import {
  CitizenLookupDto,
  CitizenLookupResponseDto,
} from './dto/citizen-lookup.dto';

const CLIENT_INSTANCE_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

@ApiTags('registration')
@Controller('registration')
export class RegistrationController {
  constructor(private readonly citizenLookup: CitizenLookupService) {}

  @Post('citizen/lookup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a short-lived citizen registration challenge',
  })
  @ApiHeader({
    name: 'x-client-instance-id',
    required: true,
    description: 'Stable non-secret client instance identifier',
  })
  @ApiCreatedResponse({ type: CitizenLookupResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid lookup request' })
  @ApiTooManyRequestsResponse({ description: 'Lookup rate limit exceeded' })
  initiateCitizenLookup(
    @Body() input: CitizenLookupDto,
    @Headers('x-client-instance-id') clientInstanceId: string | undefined,
    @Req() request: CorrelatedRequest,
  ): Promise<CitizenLookupResponseDto> {
    if (!clientInstanceId || !CLIENT_INSTANCE_PATTERN.test(clientInstanceId)) {
      throw new BadRequestException({
        code: 'CLIENT_INSTANCE_INVALID',
        message: 'A valid client instance identifier is required.',
      });
    }

    return this.citizenLookup.initiate(input, {
      correlationId: request.correlationId,
      ipAddress: request.ip || request.socket.remoteAddress || 'unknown',
      clientInstanceId,
    });
  }
}
