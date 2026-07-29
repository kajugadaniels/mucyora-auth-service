import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty()
  @IsString()
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(43)
  @MaxLength(128)
  token!: string;

  @ApiProperty()
  @IsString()
  @MinLength(15)
  @MaxLength(128)
  newPassword!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty()
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
