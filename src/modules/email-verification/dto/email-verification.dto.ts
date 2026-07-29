import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { RWANDA_OPENAPI_EXAMPLES } from '../../../common/openapi/auth-openapi';

export class VerifyEmailDto {
  @ApiProperty({ example: RWANDA_OPENAPI_EXAMPLES.opaqueToken })
  @IsString()
  @MinLength(43)
  @MaxLength(512)
  @Matches(/^[A-Za-z0-9_-]+$/)
  token!: string;
}

export class ResendEmailVerificationDto {
  @ApiProperty({
    maxLength: 320,
    example: RWANDA_OPENAPI_EXAMPLES.email,
  })
  @IsString()
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class VerifyEmailResponseDto {
  @ApiProperty({ enum: ['verified'] })
  status!: 'verified';

  @ApiProperty({ enum: ['IDENTITY_VERIFICATION'] })
  nextAction!: 'IDENTITY_VERIFICATION';
}

export class ResendEmailVerificationResponseDto {
  @ApiProperty({ enum: ['accepted'] })
  status!: 'accepted';
}
