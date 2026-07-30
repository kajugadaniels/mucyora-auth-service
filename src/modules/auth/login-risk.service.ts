import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../common/database/database.service';

export interface LoginRiskDecision {
  level: 'LOW' | 'ELEVATED';
  reason: string | null;
}

@Injectable()
export class LoginRiskService {
  constructor(private readonly database: DatabaseService) {}

  async assess(input: {
    userId: string;
    deviceId: string;
    ipHash: string;
    userAgentHash: string;
  }): Promise<LoginRiskDecision> {
    const sessions = await this.database.authSession.findMany({
      where: { userId: input.userId },
      select: { deviceId: true, ipHash: true, userAgentHash: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    if (sessions.length === 0) return { level: 'LOW', reason: null };
    const knownDevice = sessions.some(
      (session) => session.deviceId === input.deviceId,
    );
    if (!knownDevice) return { level: 'ELEVATED', reason: 'NEW_DEVICE' };
    const knownContext = sessions.some(
      (session) =>
        session.deviceId === input.deviceId &&
        session.ipHash === input.ipHash &&
        session.userAgentHash === input.userAgentHash,
    );
    return knownContext
      ? { level: 'LOW', reason: null }
      : { level: 'ELEVATED', reason: 'DEVICE_CONTEXT_CHANGED' };
  }
}
