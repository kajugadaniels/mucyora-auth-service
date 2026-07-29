import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ConsentType } from '@mucyora/db';

export class RegistrationConsentDto {
  @ApiProperty({ enum: ConsentType })
  @IsEnum(ConsentType)
  type!: ConsentType;

  @ApiProperty({ example: '2026-07-01' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}(?:\.[A-Za-z0-9_-]{1,32})?$/)
  policyVersion!: string;
}

export class RegistrationDto {
  @ApiProperty()
  @IsString()
  @MinLength(64)
  @MaxLength(2_048)
  registrationChallengeToken!: string;

  @ApiProperty({ maxLength: 320 })
  @IsString()
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ minLength: 15, maxLength: 128 })
  @IsString()
  @MinLength(15)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ type: [RegistrationConsentDto] })
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => RegistrationConsentDto)
  consents!: RegistrationConsentDto[];
}

export class RegistrationResponseDto {
  @ApiProperty()
  userReference!: string;

  @ApiProperty()
  maskedEmail!: string;

  @ApiProperty()
  emailVerificationRequired!: true;

  @ApiProperty()
  identityVerificationRequired!: true;

  @ApiProperty({ enum: ['VERIFY_EMAIL'] })
  nextAction!: 'VERIFY_EMAIL';
}
