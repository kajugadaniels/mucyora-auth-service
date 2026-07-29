import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { SecurityPrimitivesModule } from './security/security-primitives.module';

@Module({
  imports: [DatabaseModule, SecurityPrimitivesModule],
  exports: [DatabaseModule, SecurityPrimitivesModule],
})
export class CommonModule {}
