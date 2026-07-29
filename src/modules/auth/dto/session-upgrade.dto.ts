import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';

import { TokenTransport } from './auth.dto';

export class SessionUpgradeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  verificationAttemptId!: string;

  @ApiProperty({ enum: TokenTransport })
  @IsEnum(TokenTransport)
  transport!: TokenTransport;
}
