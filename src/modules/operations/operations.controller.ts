import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { InternalServiceGuard } from '../step-up-verification/internal-service.guard';
import { OperationalJobsService } from './operational-jobs.service';

@ApiTags('internal-operations')
@UseGuards(InternalServiceGuard)
@Controller('internal/operations')
export class OperationsController {
  constructor(private readonly jobs: OperationalJobsService) {}

  @Get('jobs')
  @ApiOperation({ summary: 'Read minimized operational job health' })
  status() {
    return this.jobs.status();
  }
}
