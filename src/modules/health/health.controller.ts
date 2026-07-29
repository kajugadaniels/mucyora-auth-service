import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HealthService } from './health.service';
import type { HealthStatus } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @ApiOperation({ summary: 'Check process liveness without dependency calls' })
  @ApiOkResponse({
    schema: {
      example: {
        status: 'ok',
        service: 'mucyora-auth',
        timestamp: '2026-07-30T10:00:00.000Z',
      },
    },
  })
  live(): HealthStatus {
    return this.health.live();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Check database-backed traffic readiness' })
  @ApiOkResponse({
    schema: {
      example: {
        status: 'ok',
        service: 'mucyora-auth',
        timestamp: '2026-07-30T10:00:00.000Z',
        checks: { database: 'up' },
      },
    },
  })
  @ApiServiceUnavailableResponse({
    schema: {
      example: {
        status: 'unavailable',
        service: 'mucyora-auth',
        timestamp: '2026-07-30T10:00:00.000Z',
        checks: { database: 'down' },
      },
    },
  })
  async ready(): Promise<HealthStatus> {
    const status = await this.health.ready();
    if (status.status !== 'ok') {
      throw new ServiceUnavailableException(status);
    }

    return status;
  }
}
