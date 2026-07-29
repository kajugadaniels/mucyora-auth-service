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

export enum TokenTransport {
  COOKIE = 'COOKIE',
  NATIVE = 'NATIVE',
}

export class LoginDto {
  @ApiProperty()
  @IsString()
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;

  @ApiProperty()
  @IsString()
  @Matches(/^[A-Za-z0-9._:-]{16,128}$/)
  deviceId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceLabel?: string;

  @ApiProperty({ enum: TokenTransport })
  @IsEnum(TokenTransport)
  transport!: TokenTransport;
}

export class RefreshDto {
  @ApiProperty({ enum: TokenTransport })
  @IsEnum(TokenTransport)
  transport!: TokenTransport;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(43)
  @MaxLength(128)
  refreshToken?: string;
}

export class AuthTokenResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  expiresIn!: number;

  @ApiProperty({ enum: SessionLevel })
  sessionLevel!: SessionLevel;

  @ApiProperty()
  identityVerified!: boolean;

  @ApiPropertyOptional()
  refreshToken?: string;
}
