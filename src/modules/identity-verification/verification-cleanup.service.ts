import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VerificationAttemptStatus } from '@mucyora/db';

import { DatabaseService } from '../../common/database/database.service';
import { DistributedJobLockService } from '../../common/operations/distributed-job-lock.service';
import { IdentityEncryptionService } from '../../common/security/identity-encryption.service';
import { AuthEnvironment } from '../../config/environment.validation';
import { VerificationStorageService } from '../../integrations/verification-storage/verification-storage.service';

@Injectable()
export class VerificationCleanupService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: NodeJS.Timeout;
  private running = false;
  private orphanContinuationToken?: string;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService<AuthEnvironment, true>,
    private readonly encryption: IdentityEncryptionService,
    private readonly storage: VerificationStorageService,
    private readonly locks: DistributedJobLockService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('VERIFICATION_CLEANUP_ENABLED', { infer: true })) {
      return;
    }
    this.timer = setInterval(
      () => void this.runMaintenance(),
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
      const result = await this.locks.runExclusive(
        'verification-media-cleanup',
        this.config.get('OPERATIONAL_JOB_LOCK_TTL_SECONDS', { infer: true }),
        () => this.deleteExpiredMediaBatch(),
      );
      return result ?? 0;
    } finally {
      this.running = false;
    }
  }

  async reconcileOrphanedObjects(): Promise<number> {
    const result = await this.locks.runExclusive(
      'verification-object-reconciliation',
      this.config.get('OPERATIONAL_JOB_LOCK_TTL_SECONDS', { infer: true }),
      async () => {
        const cutoff = new Date(
          Date.now() -
            this.config.get('VERIFICATION_ORPHAN_GRACE_SECONDS', {
              infer: true,
            }) *
              1_000,
        );
        const page = await this.storage.listObjects(
          this.config.get('OPERATIONAL_JOB_BATCH_SIZE', { infer: true }),
          this.orphanContinuationToken,
        );
        this.orphanContinuationToken = page.nextContinuationToken;
        const batchSize = this.config.get('OPERATIONAL_JOB_BATCH_SIZE', {
          infer: true,
        });
        const legacyMedia = await this.database.verificationMedia.findMany({
          where: { objectReferenceDigest: null, deletedAt: null },
          take: batchSize,
          select: {
            id: true,
            objectKeyEncryptedOrOpaqueReference: true,
          },
        });
        const legacyByDigest = new Map<string, string>();
        let unreadableLegacyReference = false;
        for (const item of legacyMedia) {
          try {
            const key = this.encryption.open(
              item.objectKeyEncryptedOrOpaqueReference,
              'verification-media-reference',
            );
            const digest = this.storage.objectReferenceDigest(key);
            legacyByDigest.set(digest, item.id);
            await this.database.verificationMedia.updateMany({
              where: { id: item.id, objectReferenceDigest: null },
              data: { objectReferenceDigest: digest },
            });
          } catch {
            unreadableLegacyReference = true;
          }
        }
        const legacyScanComplete =
          legacyMedia.length < batchSize && !unreadableLegacyReference;
        const pageDigests = page.objects.map((object) =>
          this.storage.objectReferenceDigest(object.key),
        );
        const trackedMedia = await this.database.verificationMedia.findMany({
          where: { objectReferenceDigest: { in: pageDigests } },
          select: { objectReferenceDigest: true },
        });
        const trackedDigests = new Set(
          trackedMedia.flatMap(({ objectReferenceDigest }) =>
            objectReferenceDigest ? [objectReferenceDigest] : [],
          ),
        );
        let deleted = 0;
        for (const object of page.objects) {
          if (object.lastModified > cutoff) {
            continue;
          }
          const digest = this.storage.objectReferenceDigest(object.key);
          const legacyId = legacyByDigest.get(digest);
          if (!legacyId && !trackedDigests.has(digest) && legacyScanComplete) {
            try {
              await this.storage.deleteObject(object.key);
              deleted += 1;
            } catch {
              // A later bounded reconciliation pass retries the orphan.
            }
          }
        }
        return deleted;
      },
    );
    return result ?? 0;
  }

  async runMaintenance(): Promise<{
    expiredMediaDeleted: number;
    orphanedObjectsDeleted: number;
  }> {
    const expiredMediaDeleted = await this.reconcileExpiredMedia();
    const orphanedObjectsDeleted = await this.reconcileOrphanedObjects();
    return { expiredMediaDeleted, orphanedObjectsDeleted };
  }

  private async deleteExpiredMediaBatch(): Promise<number> {
    const now = new Date();
    const media = await this.database.verificationMedia.findMany({
      where: {
        deletedAt: null,
        expiresAt: { lte: now },
        nextDeletionAttemptAt: { lte: now },
        OR: [{ legalHoldUntil: null }, { legalHoldUntil: { lte: now } }],
        verificationAttempt: {
          status: { not: VerificationAttemptStatus.REVIEW_REQUIRED },
        },
      },
      orderBy: { expiresAt: 'asc' },
      take: this.config.get('OPERATIONAL_JOB_BATCH_SIZE', { infer: true }),
      select: {
        id: true,
        objectKeyEncryptedOrOpaqueReference: true,
        objectVersion: true,
        deletionAttemptCount: true,
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
          data: {
            deletedAt: new Date(),
            lastDeletionError: null,
          },
        });
        deleted += updated.count;
      } catch {
        const delaySeconds = Math.min(
          this.config.get('MEDIA_DELETE_RETRY_MAX_SECONDS', { infer: true }),
          this.config.get('MEDIA_DELETE_RETRY_BASE_SECONDS', {
            infer: true,
          }) *
            2 ** Math.min(item.deletionAttemptCount, 10),
        );
        await this.database.verificationMedia.updateMany({
          where: { id: item.id, deletedAt: null },
          data: {
            deletionAttemptCount: { increment: 1 },
            nextDeletionAttemptAt: new Date(Date.now() + delaySeconds * 1_000),
            lastDeletionError: 'OBJECT_DELETE_FAILED',
          },
        });
      }
    }
    return deleted;
  }

  async deleteAttemptMedia(attemptId: string): Promise<void> {
    const media = await this.database.verificationMedia.findMany({
      where: {
        verificationAttemptId: attemptId,
        deletedAt: null,
        OR: [{ legalHoldUntil: null }, { legalHoldUntil: { lte: new Date() } }],
      },
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
