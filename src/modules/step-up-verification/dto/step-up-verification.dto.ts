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

const STEP_UP_PURPOSES = [
  VerificationPurpose.DEVICE_TRANSFER,
  VerificationPurpose.AGREEMENT_SIGNING,
  VerificationPurpose.ACCOUNT_RECOVERY,
] as const;

export class CreateStepUpChallengeDto {
  @ApiProperty({ enum: STEP_UP_PURPOSES })
  @IsEnum(VerificationPurpose)
  purpose!: VerificationPurpose;

  @ApiProperty({
    description: 'Opaque identifier of the protected target resource',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  @Matches(/^[A-Za-z0-9._:-]+$/)
  targetResourceId!: string;
}

export class ConsumeStepUpAssertionDto extends CreateStepUpChallengeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty()
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
