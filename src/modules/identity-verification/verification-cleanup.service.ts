import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DatabaseService } from '../../common/database/database.service';
import { IdentityEncryptionService } from '../../common/security/identity-encryption.service';
import { AuthEnvironment } from '../../config/environment.validation';
import { VerificationStorageService } from '../../integrations/verification-storage/verification-storage.service';

@Injectable()
export class VerificationCleanupService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService<AuthEnvironment, true>,
    private readonly encryption: IdentityEncryptionService,
    private readonly storage: VerificationStorageService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('VERIFICATION_CLEANUP_ENABLED', { infer: true })) {
      return;
    }
    this.timer = setInterval(
      () => void this.reconcileExpiredMedia(),
      this.config.get('VERIFICATION_CLEANUP_INTERVAL_MS', { infer: true }),
    );
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async reconcileExpiredMedia(): Promise<number> {
    if (this.running) {
      return 0;
    }
    this.running = true;
    try {
      const media = await this.database.verificationMedia.findMany({
        where: { deletedAt: null, expiresAt: { lte: new Date() } },
        orderBy: { expiresAt: 'asc' },
        take: 50,
        select: {
          id: true,
          objectKeyEncryptedOrOpaqueReference: true,
          objectVersion: true,
        },
      });
      let deleted = 0;
      for (const item of media) {
        try {
          const key = this.encryption.open(
            item.objectKeyEncryptedOrOpaqueReference,
            'verification-media-reference',
          );
          await this.storage.deleteObject(key, item.objectVersion ?? undefined);
          const updated = await this.database.verificationMedia.updateMany({
            where: { id: item.id, deletedAt: null },
            data: { deletedAt: new Date() },
          });
          deleted += updated.count;
        } catch {
          // A later bounded reconciliation pass retries safe deletion.
        }
      }
      return deleted;
    } finally {
      this.running = false;
    }
  }

  async deleteAttemptMedia(attemptId: string): Promise<void> {
    const media = await this.database.verificationMedia.findMany({
      where: { verificationAttemptId: attemptId, deletedAt: null },
      take: 3,
      select: {
        id: true,
        objectKeyEncryptedOrOpaqueReference: true,
        objectVersion: true,
      },
    });
    await Promise.all(
      media.map(async (item) => {
        try {
          const key = this.encryption.open(
            item.objectKeyEncryptedOrOpaqueReference,
            'verification-media-reference',
          );
          await this.storage.deleteObject(key, item.objectVersion ?? undefined);
          await this.database.verificationMedia.updateMany({
            where: { id: item.id, deletedAt: null },
            data: { deletedAt: new Date() },
          });
        } catch {
          // Expiry-indexed reconciliation provides a durable retry path.
        }
      }),
    );
  }
}
