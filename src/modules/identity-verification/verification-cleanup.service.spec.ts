/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { ConfigService } from '@nestjs/config';

import { DatabaseService } from '../../common/database/database.service';
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
});
