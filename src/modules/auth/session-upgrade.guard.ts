import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SessionLevel, SessionStatus, UserAccountStatus } from '@mucyora/db';

import { DatabaseService } from '../../common/database/database.service';
import { AccessTokenService } from './access-token.service';
import type { AuthenticatedRequest } from './access-auth.guard';

export const SESSION_UPGRADE_REVOCATION_REASON =
  'LIMITED_TO_FULL_SESSION_UPGRADE';

@Injectable()
export class SessionUpgradeGuard implements CanActivate {
  constructor(
    private readonly tokens: AccessTokenService,
    private readonly database: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(
      request.header('authorization') ?? '',
    );
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
        revocationReason: true,
        user: { select: { accountStatus: true } },
      },
    });
    const activeOrUpgradeReplay =
      session?.status === SessionStatus.ACTIVE ||
      (session?.status === SessionStatus.REVOKED &&
        session.revocationReason === SESSION_UPGRADE_REVOCATION_REASON);

    if (
      !session ||
      session.userId !== claims.sub ||
      session.sessionLevel !== SessionLevel.LIMITED ||
      claims.sessionLevel !== SessionLevel.LIMITED ||
      !activeOrUpgradeReplay ||
      session.expiresAt.getTime() <= Date.now() ||
      session.user.accountStatus !== UserAccountStatus.ACTIVE
    ) {
      throw this.unauthorized();
    }

    request.auth = claims;
    return true;
  }

  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'SESSION_UPGRADE_AUTH_INVALID',
      message: 'A valid limited session is required.',
    });
  }
}
