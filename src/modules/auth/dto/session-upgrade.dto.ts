import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';

import { TokenTransport } from './auth.dto';
import { RWANDA_OPENAPI_EXAMPLES } from '../../../common/openapi/auth-openapi';

export class SessionUpgradeDto {
  @ApiProperty({
    format: 'uuid',
    example: RWANDA_OPENAPI_EXAMPLES.attemptId,
  })
  @IsUUID()
  verificationAttemptId!: string;

  @ApiProperty({ enum: TokenTransport, example: TokenTransport.NATIVE })
  @IsEnum(TokenTransport)
  transport!: TokenTransport;
}
