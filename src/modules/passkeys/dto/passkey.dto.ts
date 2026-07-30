import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TokenTransport } from '../../auth/dto/auth.dto';

export class PasskeyRegistrationOptionsDto {
  @ApiProperty({ example: 'Aline Uwase – telefoni' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;
}

export class ConsumeRecoveryCodeDto {
  @ApiProperty({ example: 'aline.uwase@example.rw' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ example: 'RwandaRecoveryCode_0001' })
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  recoveryCode!: string;
}

export class PasskeyAuthenticationOptionsDto {
  @ApiProperty({ example: 'aline.uwase@example.rw' })
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class PasskeyAuthenticationVerifyDto {
  @ApiProperty({ example: 'PasskeyFlow_00000000000000000000000000000001' })
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  flowId!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  response!: Record<string, unknown>;

  @ApiProperty({ example: 'android-kigali-0001' })
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  deviceId!: string;

  @ApiProperty({ example: 'Aline Pixel – Kigali' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceLabel?: string;

  @ApiProperty({ enum: TokenTransport, example: TokenTransport.NATIVE })
  @IsEnum(TokenTransport)
  transport!: TokenTransport;
}

export class PasskeyRegistrationVerifyDto {
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  response!: Record<string, unknown>;

  @ApiProperty({ example: 'Aline Uwase – telefoni' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;
}
