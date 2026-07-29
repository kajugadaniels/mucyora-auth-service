import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CitizenLookupDto {
  @ApiProperty({
    description:
      'Rwanda National ID as a string; spaces and hyphens are normalized',
    example: '1000000000000001',
  })
  @IsString()
  @MinLength(16)
  @MaxLength(32)
  @Matches(/^[\d\s-]+$/, {
    message: 'nid may contain only digits, spaces, and hyphens',
  })
  nid!: string;

  @ApiProperty({
    description: 'Email address bound to the registration challenge',
    example: 'user@example.com',
    maxLength: 320,
  })
  @IsString()
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class CitizenPreviewDto {
  @ApiProperty()
  surname!: string;

  @ApiProperty()
  givenNames!: string;

  @ApiProperty({ format: 'date' })
  dateOfBirth!: string;

  @ApiProperty()
  nationality!: string;

  @ApiProperty()
  sex!: string;
}

export class CitizenLookupResponseDto {
  @ApiProperty({
    description:
      'Opaque, short-lived token required by the registration submission',
  })
  registrationChallengeToken!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ type: CitizenPreviewDto })
  citizen!: CitizenPreviewDto;
}
