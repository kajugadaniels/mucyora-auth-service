import { ApiProperty } from '@nestjs/swagger';
import { VerificationPurpose } from '@mucyora/db';
import {
  IsEnum,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { RWANDA_OPENAPI_EXAMPLES } from '../../../common/openapi/auth-openapi';

const STEP_UP_PURPOSES = [
  VerificationPurpose.DEVICE_TRANSFER,
  VerificationPurpose.AGREEMENT_SIGNING,
  VerificationPurpose.ACCOUNT_RECOVERY,
] as const;

export class CreateStepUpChallengeDto {
  @ApiProperty({
    enum: STEP_UP_PURPOSES,
    example: VerificationPurpose.DEVICE_TRANSFER,
  })
  @IsEnum(VerificationPurpose)
  purpose!: VerificationPurpose;

  @ApiProperty({
    description: 'Opaque identifier of the protected target resource',
    example: RWANDA_OPENAPI_EXAMPLES.targetResourceId,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  @Matches(/^[A-Za-z0-9._:-]+$/)
  targetResourceId!: string;
}

export class ConsumeStepUpAssertionDto extends CreateStepUpChallengeDto {
  @ApiProperty({ format: 'uuid', example: RWANDA_OPENAPI_EXAMPLES.userId })
  @IsUUID()
  userId!: string;

  @ApiProperty({ example: RWANDA_OPENAPI_EXAMPLES.opaqueToken })
  @IsString()
  @MinLength(43)
  @MaxLength(128)
  assertion!: string;
}

export function isStepUpPurpose(
  purpose: VerificationPurpose,
): purpose is (typeof STEP_UP_PURPOSES)[number] {
  return STEP_UP_PURPOSES.includes(
    purpose as (typeof STEP_UP_PURPOSES)[number],
  );
}
