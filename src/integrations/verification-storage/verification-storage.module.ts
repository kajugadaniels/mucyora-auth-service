import { Module } from '@nestjs/common';

import { VerificationStorageService } from './verification-storage.service';

@Module({
  providers: [VerificationStorageService],
  exports: [VerificationStorageService],
})
export class VerificationStorageModule {}
