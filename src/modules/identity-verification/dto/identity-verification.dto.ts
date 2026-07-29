import { ApiProperty } from '@nestjs/swagger';
import { VerificationAttemptStatus, VerificationMediaType } from '@mucyora/db';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { RWANDA_OPENAPI_EXAMPLES } from '../../../common/openapi/auth-openapi';

export class CreateUploadPolicyDto {
  @ApiProperty({ enum: [VerificationMediaType.ID_DOCUMENT] })
  @IsEnum(VerificationMediaType)
  mediaType!: VerificationMediaType;

  @ApiProperty({ enum: ['image/jpeg', 'image/png'] })
  @IsString()
  @IsIn(['image/jpeg', 'image/png'])
  @MaxLength(32)
  contentType!: 'image/jpeg' | 'image/png';

  @ApiProperty({
    description: 'Base64 SHA-256 checksum',
    example: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9+/]{43}=$/)
  checksum!: string;

  @ApiProperty({ example: 1200 })
  @IsInt()
  @Min(1)
  @Max(12_000)
  width!: number;

  @ApiProperty({ example: 1600 })
  @IsInt()
  @Min(1)
  @Max(12_000)
  height!: number;
}

export class ConfirmUploadDto extends CreateUploadPolicyDto {
  @ApiProperty({
    example:
      'identity-verification/2026/07/e9b5dc65-6fe8-4b0d-9b65-56ca8560da44/id-document.png',
  })
  @IsString()
  @MaxLength(512)
  objectKey!: string;
}

export class VerificationAttemptResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: RWANDA_OPENAPI_EXAMPLES.attemptId,
  })
  id!: string;

  @ApiProperty({
    enum: VerificationAttemptStatus,
    example: VerificationAttemptStatus.PENDING,
  })
  status!: VerificationAttemptStatus;

  @ApiProperty({ example: 1 })
  attemptNumber!: number;

  @ApiProperty({ example: '2026-07-01' })
  policyVersion!: string;

  @ApiProperty({ required: false })
  retryAfter?: Date | null;

  @ApiProperty({ required: false })
  reasonCode?: string | null;
}
