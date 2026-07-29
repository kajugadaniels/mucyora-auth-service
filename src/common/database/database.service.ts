import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { createPrismaClientOptions, PrismaClient } from '@mucyora/db';

@Injectable()
export class DatabaseService
  extends PrismaClient
  implements OnApplicationShutdown
{
  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }

  constructor() {
    super(createPrismaClientOptions());
  }

  async isReady(): Promise<boolean> {
    await this.$queryRaw`SELECT 1`;
    return true;
  }
}
