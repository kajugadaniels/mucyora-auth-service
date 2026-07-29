import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { ConfigService } from '@nestjs/config';
import { VerificationMediaType } from '@mucyora/db';

import { AuthEnvironment } from '../../config/environment.validation';
import { VerificationStorageService } from './verification-storage.service';

jest.mock('@aws-sdk/s3-presigned-post', () => ({
  createPresignedPost: jest.fn(),
}));

describe('VerificationStorageService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('creates a private attempt-bound policy with checksum and size controls', async () => {
    const presign = createPresignedPost as jest.MockedFunction<
      typeof createPresignedPost
    >;
    presign.mockResolvedValue({
      url: 'https://storage.example/upload',
      fields: { key: 'safe-key' },
    });
    const service = new VerificationStorageService(configService());

    const policy = await service.createUploadPolicy({
      attemptId: 'attempt-1',
      mediaType: VerificationMediaType.ID_DOCUMENT,
      contentType: 'image/jpeg',
      checksum: 'A'.repeat(43) + '=',
      width: 1200,
      height: 800,
    });

    expect(policy.objectKey).toMatch(
      /^identity-verification\/attempt-1\/[0-9a-f-]+$/,
    );
    const request = presign.mock.calls[0][1];
    expect(request.Conditions).toEqual(
      expect.arrayContaining([
        ['content-length-range', 1, 5_242_880],
        ['eq', '$x-amz-meta-attempt-id', 'attempt-1'],
        ['eq', '$x-amz-checksum-sha256', 'A'.repeat(43) + '='],
      ]),
    );
  });

  it('rejects uploaded metadata that does not match the signed policy', async () => {
    jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      ContentLength: 100,
      ContentType: 'image/png',
      ChecksumSHA256: 'B'.repeat(43) + '=',
      Metadata: {
        'attempt-id': 'another-attempt',
        'media-type': VerificationMediaType.ID_DOCUMENT,
        width: '1200',
        height: '800',
      },
    } as never);
    const service = new VerificationStorageService(configService());

    await expect(
      service.confirmObject({
        objectKey: 'identity-verification/attempt-1/object',
        attemptId: 'attempt-1',
        mediaType: VerificationMediaType.ID_DOCUMENT,
        contentType: 'image/png',
        checksum: 'B'.repeat(43) + '=',
        width: 1200,
        height: 800,
      }),
    ).rejects.toThrow('does not match policy');
  });
});

function configService(): ConfigService<AuthEnvironment, true> {
  const values: Partial<AuthEnvironment> = {
    AWS_REGION: 'eu-west-1',
    AWS_S3_VERIFICATION_BUCKET: 'mucyora-verification-test',
    AWS_S3_VERIFICATION_PREFIX: 'identity-verification/',
    AWS_S3_ENDPOINT: '',
    AWS_S3_FORCE_PATH_STYLE: false,
    AWS_ACCESS_KEY_ID: 'test-access',
    AWS_SECRET_ACCESS_KEY: 'test-secret',
    AWS_SESSION_TOKEN: '',
    VERIFICATION_MEDIA_MAX_SIZE_BYTES: 5_242_880,
    VERIFICATION_UPLOAD_TTL_SECONDS: 300,
  };
  return {
    get: jest.fn((key: keyof AuthEnvironment) => values[key]),
  } as unknown as ConfigService<AuthEnvironment, true>;
}
