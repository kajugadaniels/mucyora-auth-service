import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { HealthService } from './health.service';
import type { HealthStatus } from './health.service';

@ApiExcludeController()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  live(): HealthStatus {
    return this.health.live();
  }

  @Get('ready')
  async ready(): Promise<HealthStatus> {
    const status = await this.health.ready();
    if (status.status !== 'ok') {
      throw new ServiceUnavailableException(status);
    }

    return status;
  }
}
