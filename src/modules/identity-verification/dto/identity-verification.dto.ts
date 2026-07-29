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

export class CreateUploadPolicyDto {
  @ApiProperty({ enum: [VerificationMediaType.ID_DOCUMENT] })
  @IsEnum(VerificationMediaType)
  mediaType!: VerificationMediaType;

  @ApiProperty({ enum: ['image/jpeg', 'image/png'] })
  @IsString()
  @IsIn(['image/jpeg', 'image/png'])
  @MaxLength(32)
  contentType!: 'image/jpeg' | 'image/png';

  @ApiProperty({ description: 'Base64 SHA-256 checksum' })
  @IsString()
  @Matches(/^[A-Za-z0-9+/]{43}=$/)
  checksum!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(12_000)
  width!: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(12_000)
  height!: number;
}

export class ConfirmUploadDto extends CreateUploadPolicyDto {
  @ApiProperty()
  @IsString()
  @MaxLength(512)
  objectKey!: string;
}

export class VerificationAttemptResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: VerificationAttemptStatus })
  status!: VerificationAttemptStatus;

  @ApiProperty()
  attemptNumber!: number;

  @ApiProperty()
  policyVersion!: string;

  @ApiProperty({ required: false })
  retryAfter?: Date | null;

  @ApiProperty({ required: false })
  reasonCode?: string | null;
}
