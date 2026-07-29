import { createHash, randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VerificationMediaType } from '@mucyora/db';

import { AuthEnvironment } from '../../config/environment.validation';

export interface VerificationUploadPolicy {
  objectKey: string;
  url: string;
  fields: Record<string, string>;
  expiresAt: Date;
  maximumSizeBytes: number;
}

export interface ConfirmedVerificationObject {
  objectVersion?: string;
  checksum: string;
  contentType: string;
  sizeBytes: number;
}

export interface VerificationStorageObject {
  key: string;
  lastModified: Date;
}

export interface VerificationStoragePage {
  objects: VerificationStorageObject[];
  nextContinuationToken?: string;
}

@Injectable()
export class VerificationStorageService {
  private readonly client: S3Client;

  constructor(private readonly config: ConfigService<AuthEnvironment, true>) {
    const accessKeyId = config.get('AWS_ACCESS_KEY_ID', { infer: true });
    const secretAccessKey = config.get('AWS_SECRET_ACCESS_KEY', {
      infer: true,
    });
    const sessionToken = config.get('AWS_SESSION_TOKEN', { infer: true });
    this.client = new S3Client({
      region: config.get('AWS_REGION', { infer: true }),
      endpoint: config.get('AWS_S3_ENDPOINT', { infer: true }) || undefined,
      forcePathStyle: config.get('AWS_S3_FORCE_PATH_STYLE', { infer: true }),
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey,
              sessionToken: sessionToken || undefined,
            }
          : undefined,
    });
  }

  async createUploadPolicy(input: {
    attemptId: string;
    mediaType: VerificationMediaType;
    contentType: 'image/jpeg' | 'image/png';
    checksum: string;
    width: number;
    height: number;
  }): Promise<VerificationUploadPolicy> {
    const key = `${this.config.get('AWS_S3_VERIFICATION_PREFIX', {
      infer: true,
    })}${input.attemptId}/${randomUUID()}`;
    const maximumSizeBytes = this.config.get(
      'VERIFICATION_MEDIA_MAX_SIZE_BYTES',
      { infer: true },
    );
    const expiresIn = this.config.get('VERIFICATION_UPLOAD_TTL_SECONDS', {
      infer: true,
    });
    const fields = {
      'Content-Type': input.contentType,
      'x-amz-checksum-sha256': input.checksum,
      'x-amz-meta-attempt-id': input.attemptId,
      'x-amz-meta-media-type': input.mediaType,
      'x-amz-meta-width': String(input.width),
      'x-amz-meta-height': String(input.height),
    };
    const policy = await createPresignedPost(this.client, {
      Bucket: this.config.get('AWS_S3_VERIFICATION_BUCKET', { infer: true }),
      Key: key,
      Fields: fields,
      Conditions: [
        ['eq', '$key', key],
        ['eq', '$Content-Type', input.contentType],
        ['eq', '$x-amz-checksum-sha256', input.checksum],
        ['eq', '$x-amz-meta-attempt-id', input.attemptId],
        ['eq', '$x-amz-meta-media-type', input.mediaType],
        ['eq', '$x-amz-meta-width', String(input.width)],
        ['eq', '$x-amz-meta-height', String(input.height)],
        ['content-length-range', 1, maximumSizeBytes],
      ],
      Expires: expiresIn,
    });

    return {
      objectKey: key,
      url: policy.url,
      fields: policy.fields,
      expiresAt: new Date(Date.now() + expiresIn * 1_000),
      maximumSizeBytes,
    };
  }

  async confirmObject(input: {
    objectKey: string;
    attemptId: string;
    mediaType: VerificationMediaType;
    contentType: string;
    checksum: string;
    width: number;
    height: number;
  }): Promise<ConfirmedVerificationObject> {
    const response = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.config.get('AWS_S3_VERIFICATION_BUCKET', { infer: true }),
        Key: input.objectKey,
        ChecksumMode: 'ENABLED',
      }),
    );
    const size = response.ContentLength ?? 0;
    const maximum = this.config.get('VERIFICATION_MEDIA_MAX_SIZE_BYTES', {
      infer: true,
    });
    const metadata = response.Metadata ?? {};
    if (
      size < 1 ||
      size > maximum ||
      response.ContentType !== input.contentType ||
      response.ChecksumSHA256 !== input.checksum ||
      metadata['attempt-id'] !== input.attemptId ||
      metadata['media-type'] !== input.mediaType ||
      metadata.width !== String(input.width) ||
      metadata.height !== String(input.height)
    ) {
      throw new Error('Verification object metadata does not match policy');
    }
    return {
      objectVersion: response.VersionId,
      checksum: input.checksum,
      contentType: input.contentType,
      sizeBytes: size,
    };
  }

  async deleteObject(objectKey: string, versionId?: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.get('AWS_S3_VERIFICATION_BUCKET', { infer: true }),
        Key: objectKey,
        VersionId: versionId,
      }),
    );
  }

  async listObjects(
    limit: number,
    continuationToken?: string,
  ): Promise<VerificationStoragePage> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.config.get('AWS_S3_VERIFICATION_BUCKET', { infer: true }),
        Prefix: this.config.get('AWS_S3_VERIFICATION_PREFIX', { infer: true }),
        MaxKeys: limit,
        ContinuationToken: continuationToken,
      }),
    );
    return {
      objects: (response.Contents ?? []).flatMap((object) =>
        object.Key && object.LastModified
          ? [{ key: object.Key, lastModified: object.LastModified }]
          : [],
      ),
      nextContinuationToken: response.NextContinuationToken,
    };
  }

  objectReferenceDigest(objectKey: string): string {
    return createHash('sha256').update(objectKey).digest('base64url');
  }
}
