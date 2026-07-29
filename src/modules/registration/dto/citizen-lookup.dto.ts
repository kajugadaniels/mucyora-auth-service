import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { RWANDA_OPENAPI_EXAMPLES } from '../../../common/openapi/auth-openapi';

export class CitizenLookupDto {
  @ApiProperty({
    description:
      'Rwanda National ID as a string; spaces and hyphens are normalized',
    example: RWANDA_OPENAPI_EXAMPLES.nid,
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
    example: RWANDA_OPENAPI_EXAMPLES.email,
    maxLength: 320,
  })
  @IsString()
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class CitizenPreviewDto {
  @ApiProperty({ example: RWANDA_OPENAPI_EXAMPLES.surname })
  surname!: string;

  @ApiProperty({ example: RWANDA_OPENAPI_EXAMPLES.givenNames })
  givenNames!: string;

  @ApiProperty({
    format: 'date',
    example: RWANDA_OPENAPI_EXAMPLES.dateOfBirth,
  })
  dateOfBirth!: string;

  @ApiProperty({ example: 'Rwandan' })
  nationality!: string;

  @ApiProperty({ example: 'F' })
  sex!: string;
}

export class CitizenLookupResponseDto {
  @ApiProperty({
    description:
      'Opaque, short-lived token required by the registration submission',
    example: RWANDA_OPENAPI_EXAMPLES.opaqueToken,
  })
  registrationChallengeToken!: string;

  @ApiProperty({ format: 'date-time', example: '2026-07-30T10:10:00.000Z' })
  expiresAt!: string;

  @ApiProperty({ type: CitizenPreviewDto })
  citizen!: CitizenPreviewDto;
}
