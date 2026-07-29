import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SessionLevel } from '@mucyora/db';
import { RWANDA_OPENAPI_EXAMPLES } from '../../../common/openapi/auth-openapi';

export enum TokenTransport {
  COOKIE = 'COOKIE',
  NATIVE = 'NATIVE',
}

export class LoginDto {
  @ApiProperty({ example: RWANDA_OPENAPI_EXAMPLES.email })
  @IsString()
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({
    example: 'Umusozi!Kigali-2026',
    description: 'Example only; never reuse documentation passwords.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ example: RWANDA_OPENAPI_EXAMPLES.deviceId })
  @IsString()
  @Matches(/^[A-Za-z0-9._:-]{16,128}$/)
  deviceId!: string;

  @ApiPropertyOptional({ example: RWANDA_OPENAPI_EXAMPLES.deviceLabel })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceLabel?: string;

  @ApiProperty({ enum: TokenTransport, example: TokenTransport.NATIVE })
  @IsEnum(TokenTransport)
  transport!: TokenTransport;
}

export class RefreshDto {
  @ApiProperty({ enum: TokenTransport, example: TokenTransport.NATIVE })
  @IsEnum(TokenTransport)
  transport!: TokenTransport;

  @ApiPropertyOptional({ example: RWANDA_OPENAPI_EXAMPLES.opaqueToken })
  @IsOptional()
  @IsString()
  @MinLength(43)
  @MaxLength(128)
  refreshToken?: string;
}

export class AuthTokenResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Im11Y3lvcmEifQ...' })
  accessToken!: string;

  @ApiProperty({ example: 900 })
  expiresIn!: number;

  @ApiProperty({ enum: SessionLevel, example: SessionLevel.FULL })
  sessionLevel!: SessionLevel;

  @ApiProperty({ example: true })
  identityVerified!: boolean;

  @ApiPropertyOptional({ example: RWANDA_OPENAPI_EXAMPLES.opaqueToken })
  refreshToken?: string;
}
