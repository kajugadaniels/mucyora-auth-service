import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SessionLevel } from '@mucyora/db';

import type { AuthenticatedRequest } from './access-auth.guard';

const SESSION_LEVEL_KEY = 'required-session-level';

export const RequireSessionLevel = (level: SessionLevel) =>
  SetMetadata(SESSION_LEVEL_KEY, level);

@Injectable()
export class SessionLevelGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<SessionLevel>(
      SESSION_LEVEL_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (
      request.auth.sessionLevel === SessionLevel.FULL ||
      request.auth.sessionLevel === required
    ) {
      return true;
    }
    throw new ForbiddenException({
      code: 'FULL_SESSION_REQUIRED',
      message: 'Additional identity verification is required.',
    });
  }
}
