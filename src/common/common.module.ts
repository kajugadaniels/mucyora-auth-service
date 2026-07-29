import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { SecurityPrimitivesModule } from './security/security-primitives.module';
import { DistributedJobLockService } from './operations/distributed-job-lock.service';

@Global()
@Module({
  imports: [DatabaseModule, SecurityPrimitivesModule],
  providers: [DistributedJobLockService],
  exports: [
    DatabaseModule,
    SecurityPrimitivesModule,
    DistributedJobLockService,
  ],
})
export class CommonModule {}
