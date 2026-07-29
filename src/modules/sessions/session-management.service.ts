import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AuthSecurityEventType,
  SecurityEventOutcome,
  SecurityEventSeverity,
  SessionStatus,
} from '@mucyora/db';

import { DatabaseService } from '../../common/database/database.service';
import { KeyedDigestService } from '../../common/security/keyed-digest.service';
import type { AccessTokenClaims } from '../auth/access-token.service';

export interface SessionRequestContext {
  correlationId: string;
  ipAddress: string;
}

@Injectable()
export class SessionManagementService {
  constructor(
    private readonly database: DatabaseService,
    private readonly digests: KeyedDigestService,
  ) {}

  async logout(
    principal: AccessTokenClaims,
    context: SessionRequestContext,
  ): Promise<void> {
    await this.revokeSessions(
      principal,
      { id: principal.sid },
      'USER_LOGOUT',
      context,
    );
  }

  async logoutAll(
    principal: AccessTokenClaims,
    context: SessionRequestContext,
  ): Promise<void> {
    await this.revokeSessions(
      principal,
      { userId: principal.sub },
      'USER_LOGOUT_ALL',
      context,
    );
  }

  async revoke(
    principal: AccessTokenClaims,
    sessionId: string,
    context: SessionRequestContext,
  ): Promise<void> {
    const exists = await this.database.authSession.findFirst({
      where: { id: sessionId, userId: principal.sub },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: 'The session was not found.',
      });
    }
    await this.revokeSessions(
      principal,
      { id: sessionId, userId: principal.sub },
      'USER_SESSION_REVOKED',
      context,
    );
  }

  async list(principal: AccessTokenClaims) {
    const sessions = await this.database.authSession.findMany({
      where: {
        userId: principal.sub,
        status: SessionStatus.ACTIVE,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastUsedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        sessionLevel: true,
        deviceId: true,
        deviceLabel: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
    });
    return sessions.map((session) => ({
      ...session,
      current: session.id === principal.sid,
    }));
  }

  private async revokeSessions(
    principal: AccessTokenClaims,
    where: { id?: string; userId?: string },
    reason: string,
    context: SessionRequestContext,
  ): Promise<void> {
    const now = new Date();
    await this.database.$transaction(async (transaction) => {
      const sessions = await transaction.authSession.findMany({
        where: {
          ...where,
          status: SessionStatus.ACTIVE,
        },
        select: { id: true },
        take: 100,
      });
      const ids = sessions.map((session) => session.id);
      if (ids.length === 0) {
        return;
      }
      await transaction.authSession.updateMany({
        where: { id: { in: ids }, status: SessionStatus.ACTIVE },
        data: {
          status: SessionStatus.REVOKED,
          revokedAt: now,
          revocationReason: reason,
          version: { increment: 1 },
        },
      });
      await transaction.refreshToken.updateMany({
        where: { sessionId: { in: ids }, revokedAt: null },
        data: { revokedAt: now },
      });
      await transaction.authSecurityEvent.create({
        data: {
          userId: principal.sub,
          sessionId: ids.includes(principal.sid) ? principal.sid : undefined,
          eventType: AuthSecurityEventType.SESSION_REVOKED,
          severity: SecurityEventSeverity.INFO,
          outcome: SecurityEventOutcome.SUCCESS,
          reasonCode: reason,
          correlationId: context.correlationId,
          ipHash: this.digests.requestContext(context.ipAddress),
          safeMetadata: { revokedCount: ids.length },
        },
      });
    });
  }
}
