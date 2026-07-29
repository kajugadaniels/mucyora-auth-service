/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { ConfigService } from '@nestjs/config';

import { DatabaseService } from '../../common/database/database.service';
import { DistributedJobLockService } from '../../common/operations/distributed-job-lock.service';
import { IdentityEncryptionService } from '../../common/security/identity-encryption.service';
import { AuthEnvironment } from '../../config/environment.validation';
import { VerificationStorageService } from '../../integrations/verification-storage/verification-storage.service';
import { VerificationCleanupService } from './verification-cleanup.service';

describe('VerificationCleanupService', () => {
  it('deletes expired private media and records successful reconciliation', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const storage = {
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const service = new VerificationCleanupService(
      {
        verificationMedia: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'media-1',
              objectKeyEncryptedOrOpaqueReference: 'encrypted-key',
              objectVersion: 'version-1',
              deletionAttemptCount: 0,
            },
          ]),
          updateMany,
        },
      } as unknown as DatabaseService,
      {
        get: jest.fn().mockReturnValue(false),
      } as unknown as ConfigService<AuthEnvironment, true>,
      {
        open: jest
          .fn()
          .mockReturnValue('identity-verification/attempt-1/object'),
      } as unknown as IdentityEncryptionService,
      storage as unknown as VerificationStorageService,
      {
        runExclusive: jest.fn(
          async (_name: string, _ttl: number, work: () => Promise<unknown>) =>
            work(),
        ),
      } as unknown as DistributedJobLockService,
    );

    await expect(service.reconcileExpiredMedia()).resolves.toBe(1);
    expect(storage.deleteObject).toHaveBeenCalledWith(
      'identity-verification/attempt-1/object',
      'version-1',
    );
    expect(updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'media-1', deletedAt: null },
    });
  });

  it('backs off failed deletion without exposing provider details', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = createService(
      {
        deleteObject: jest.fn().mockRejectedValue(new Error('provider secret')),
      },
      updateMany,
    );

    await expect(service.reconcileExpiredMedia()).resolves.toBe(0);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deletionAttemptCount: { increment: 1 },
          nextDeletionAttemptAt: expect.any(Date),
          lastDeletionError: 'OBJECT_DELETE_FAILED',
        }),
      }),
    );
  });

  it('deletes only old untracked storage objects during orphan reconciliation', async () => {
    const deleteObject = jest.fn().mockResolvedValue(undefined);
    const values: Partial<AuthEnvironment> = {
      OPERATIONAL_JOB_LOCK_TTL_SECONDS: 240,
      OPERATIONAL_JOB_BATCH_SIZE: 50,
      VERIFICATION_ORPHAN_GRACE_SECONDS: 900,
    };
    const service = new VerificationCleanupService(
      {
        verificationMedia: {
          findMany: jest.fn().mockResolvedValue([]),
          findUnique: jest.fn().mockResolvedValue(null),
          updateMany: jest.fn(),
        },
      } as unknown as DatabaseService,
      {
        get: jest.fn((key: keyof AuthEnvironment) => values[key]),
      } as unknown as ConfigService<AuthEnvironment, true>,
      {} as IdentityEncryptionService,
      {
        listObjects: jest.fn().mockResolvedValue({
          objects: [
            {
              key: 'verification/orphan',
              lastModified: new Date(Date.now() - 1_800_000),
            },
          ],
        }),
        objectReferenceDigest: jest.fn().mockReturnValue('object-digest'),
        deleteObject,
      } as unknown as VerificationStorageService,
      {
        runExclusive: jest.fn(
          async (_name: string, _ttl: number, work: () => Promise<unknown>) =>
            work(),
        ),
      } as unknown as DistributedJobLockService,
    );

    await expect(service.reconcileOrphanedObjects()).resolves.toBe(1);
    expect(deleteObject).toHaveBeenCalledWith('verification/orphan');
  });
});

function createService(storage: object, updateMany: jest.Mock) {
  const values: Partial<AuthEnvironment> = {
    OPERATIONAL_JOB_LOCK_TTL_SECONDS: 240,
    OPERATIONAL_JOB_BATCH_SIZE: 50,
    MEDIA_DELETE_RETRY_BASE_SECONDS: 60,
    MEDIA_DELETE_RETRY_MAX_SECONDS: 3_600,
  };
  return new VerificationCleanupService(
    {
      verificationMedia: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'media-1',
            objectKeyEncryptedOrOpaqueReference: 'encrypted-key',
            objectVersion: 'version-1',
            deletionAttemptCount: 0,
          },
        ]),
        updateMany,
      },
    } as unknown as DatabaseService,
    {
      get: jest.fn((key: keyof AuthEnvironment) => values[key]),
    } as unknown as ConfigService<AuthEnvironment, true>,
    {
      open: jest.fn().mockReturnValue('verification/object'),
    } as unknown as IdentityEncryptionService,
    storage as VerificationStorageService,
    {
      runExclusive: jest.fn(
        async (_name: string, _ttl: number, work: () => Promise<unknown>) =>
          work(),
      ),
    } as unknown as DistributedJobLockService,
  );
}
