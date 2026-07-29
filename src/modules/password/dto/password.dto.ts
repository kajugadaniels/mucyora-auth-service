import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { RWANDA_OPENAPI_EXAMPLES } from '../../../common/openapi/auth-openapi';

export class ForgotPasswordDto {
  @ApiProperty({ example: RWANDA_OPENAPI_EXAMPLES.email })
  @IsString()
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: RWANDA_OPENAPI_EXAMPLES.opaqueToken })
  @IsString()
  @MinLength(43)
  @MaxLength(128)
  token!: string;

  @ApiProperty({ example: 'Imisozi!Rwanda-2026' })
  @IsString()
  @MinLength(15)
  @MaxLength(128)
  newPassword!: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'Umusozi!Kigali-2026' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({ example: 'Imisozi!Rwanda-2026' })
  @IsString()
  @MinLength(15)
  @MaxLength(128)
  newPassword!: string;
}

export class PasswordRequestAcceptedDto {
  @ApiProperty({ example: 'accepted' })
  status!: 'accepted';
}

export class PasswordChangedDto {
  @ApiProperty({ example: 'changed' })
  status!: 'changed';
}
