import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ConsumeRecoveryCodeDto } from './dto/passkey.dto';
import { PasskeyService } from './passkey.service';

@ApiTags('passkeys-and-recovery')
@Controller('auth/recovery-codes')
export class RecoveryCodeController {
  constructor(private readonly passkeys: PasskeyService) {}

  @Post('consume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Consume one recovery code and issue a short-lived reset token',
  })
  consume(@Body() input: ConsumeRecoveryCodeDto) {
    return this.passkeys.consumeRecoveryCode(input);
  }
}
