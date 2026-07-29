import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AccessTokenService } from './access-token.service';

@ApiTags('authentication')
@Controller('.well-known')
export class JwksController {
  constructor(private readonly accessTokens: AccessTokenService) {}

  @Get('jwks.json')
  @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=60')
  @ApiOperation({ summary: 'Return public access-token verification keys' })
  getKeys(): { keys: Array<Record<string, unknown>> } {
    return this.accessTokens.jwks();
  }
}
