import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SessionStatus, UserAccountStatus } from '@mucyora/db';
import { Request } from 'express';

import { DatabaseService } from '../../common/database/database.service';
import { AccessTokenClaims, AccessTokenService } from './access-token.service';

export interface AuthenticatedRequest extends Request {
  auth: AccessTokenClaims;
}

@Injectable()
export class AccessAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: AccessTokenService,
    private readonly database: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.header('authorization');
    const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization ?? '');
    if (!match) {
      throw this.unauthorized();
    }
    const claims = this.tokens.verify(match[1]);
    const session = await this.database.authSession.findUnique({
      where: { id: claims.sid },
      select: {
        userId: true,
        status: true,
        expiresAt: true,
        sessionLevel: true,
        user: { select: { accountStatus: true } },
      },
    });
    if (
      !session ||
      session.userId !== claims.sub ||
      session.status !== SessionStatus.ACTIVE ||
      session.expiresAt.getTime() <= Date.now() ||
      session.sessionLevel !== claims.sessionLevel ||
      session.user.accountStatus !== UserAccountStatus.ACTIVE
    ) {
      throw this.unauthorized();
    }
    request.auth = claims;
    return true;
  }

  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'ACCESS_TOKEN_INVALID',
      message: 'Authentication is required.',
    });
  }
}
