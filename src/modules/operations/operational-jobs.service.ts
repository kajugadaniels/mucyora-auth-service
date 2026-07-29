import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SessionStatus,
  StepUpChallengeStatus,
  VerificationAttemptStatus,
} from '@mucyora/db';

import { DatabaseService } from '../../common/database/database.service';
import { DistributedJobLockService } from '../../common/operations/distributed-job-lock.service';
import { AuthEnvironment } from '../../config/environment.validation';

export interface OperationalJobSnapshot {
  running: boolean;
  lastStartedAt: Date | null;
  lastCompletedAt: Date | null;
  lastFailedAt: Date | null;
  lastErrorCode: string | null;
  totals: Record<string, number>;
}

@Injectable()
export class OperationalJobsService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OperationalJobsService.name);
  private timer?: NodeJS.Timeout;
  private snapshotState: OperationalJobSnapshot = {
    running: false,
    lastStartedAt: null,
    lastCompletedAt: null,
    lastFailedAt: null,
    lastErrorCode: null,
    totals: {},
  };

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService<AuthEnvironment, true>,
    private readonly locks: DistributedJobLockService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('OPERATIONAL_JOBS_ENABLED', { infer: true })) {
      return;
    }
    this.timer = setInterval(
      () => void this.runCycle(),
      this.config.get('OPERATIONAL_JOBS_INTERVAL_MS', { infer: true }),
    );
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  status(): Readonly<OperationalJobSnapshot> {
    return {
      ...this.snapshotState,
      totals: { ...this.snapshotState.totals },
    };
  }

  async runCycle(): Promise<Record<string, number>> {
    if (this.snapshotState.running) {
      return {};
    }
    const result = await this.locks.runExclusive(
      'auth-operational-cycle',
      this.config.get('OPERATIONAL_JOB_LOCK_TTL_SECONDS', { infer: true }),
      async () => {
        this.snapshotState = {
          ...this.snapshotState,
          running: true,
          lastStartedAt: new Date(),
        };
        try {
          const totals = await this.executeJobs();
          this.snapshotState = {
            running: false,
            lastStartedAt: this.snapshotState.lastStartedAt,
            lastCompletedAt: new Date(),
            lastFailedAt: this.snapshotState.lastFailedAt,
            lastErrorCode: null,
            totals,
          };
          return totals;
        } catch {
          this.snapshotState = {
            ...this.snapshotState,
            running: false,
            lastFailedAt: new Date(),
            lastErrorCode: 'OPERATIONAL_CYCLE_FAILED',
          };
          this.logger.error({
            event: 'operational_job_alert',
            code: 'OPERATIONAL_CYCLE_FAILED',
          });
          return {};
        }
      },
    );
    return result ?? {};
  }

  private async executeJobs(): Promise<Record<string, number>> {
    const now = new Date();
    const [
      emailTokens,
      resetRequests,
      legacyResetTokens,
      idempotency,
      refreshTokens,
      sessionsExpired,
      sessionsDeleted,
      attemptsExpired,
      securityEvents,
      stepUpChallenges,
      outboxDeadLetters,
      outboxPending,
    ] = await this.runSequentially([
      () =>
        this.deleteByIds(
          'emailVerificationToken',
          {
            expiresAt: {
              lte: this.retentionCutoff(now, 'TOKEN_RETENTION_DAYS'),
            },
          },
          { expiresAt: 'asc' },
        ),
      () =>
        this.deleteByIds(
          'passwordResetRequest',
          {
            expiresAt: {
              lte: this.retentionCutoff(now, 'TOKEN_RETENTION_DAYS'),
            },
          },
          { expiresAt: 'asc' },
        ),
      () =>
        this.deleteByIds(
          'passwordResetToken',
          {
            expiresAt: {
              lte: this.retentionCutoff(now, 'TOKEN_RETENTION_DAYS'),
            },
          },
          { expiresAt: 'asc' },
        ),
      () =>
        this.deleteByIds(
          'idempotencyRecord',
          { expiresAt: { lte: now } },
          { expiresAt: 'asc' },
        ),
      () =>
        this.deleteByIds(
          'refreshToken',
          {
            expiresAt: {
              lte: this.retentionCutoff(now, 'TOKEN_RETENTION_DAYS'),
            },
          },
          { expiresAt: 'asc' },
        ),
      () => this.expireSessions(now),
      () => this.deleteRetainedSessions(now),
      () => this.expireStaleAttempts(now),
      () => this.deleteRetainedSecurityEvents(now),
      () =>
        this.deleteByIds(
          'stepUpChallenge',
          {
            status: {
              in: [
                StepUpChallengeStatus.CONSUMED,
                StepUpChallengeStatus.EXPIRED,
                StepUpChallengeStatus.REVOKED,
              ],
            },
            expiresAt: {
              lte: this.retentionCutoff(now, 'TOKEN_RETENTION_DAYS'),
            },
          },
          { expiresAt: 'asc' },
        ),
      () =>
        this.database.outboxEvent.count({
          where: { deadLetteredAt: { not: null }, publishedAt: null },
        }),
      () =>
        this.database.outboxEvent.count({
          where: {
            deadLetteredAt: null,
            publishedAt: null,
            nextAttemptAt: { lte: now },
          },
        }),
    ]);
    if (outboxDeadLetters > 0) {
      this.logger.error({
        event: 'operational_job_alert',
        code: 'OUTBOX_DEAD_LETTERS_PRESENT',
        count: outboxDeadLetters,
      });
    }
    return {
      emailTokens,
      resetRequests,
      legacyResetTokens,
      idempotency,
      refreshTokens,
      sessionsExpired,
      sessionsDeleted,
      attemptsExpired,
      securityEvents,
      stepUpChallenges,
      outboxDeadLetters,
      outboxPending,
    };
  }

  private async runSequentially(
    jobs: Array<() => Promise<number>>,
  ): Promise<number[]> {
    const results: number[] = [];
    for (const job of jobs) {
      results.push(await job());
    }
    return results;
  }

  private async deleteByIds(
    delegateName:
      | 'emailVerificationToken'
      | 'passwordResetRequest'
      | 'passwordResetToken'
      | 'idempotencyRecord'
      | 'refreshToken'
      | 'stepUpChallenge'
      | 'authSession',
    where: object,
    orderBy: object,
  ): Promise<number> {
    const delegate = this.database[delegateName] as unknown as {
      findMany(input: object): Promise<Array<{ id: string }>>;
      deleteMany(input: object): Promise<{ count: number }>;
    };
    const records = await delegate.findMany({
      where,
      orderBy,
      take: this.batchSize(),
      select: { id: true },
    });
    if (records.length === 0) {
      return 0;
    }
    const result = await delegate.deleteMany({
      where: { id: { in: records.map(({ id }) => id) } },
    });
    return result.count;
  }

  private async expireSessions(now: Date): Promise<number> {
    const sessions = await this.database.authSession.findMany({
      where: { status: SessionStatus.ACTIVE, expiresAt: { lte: now } },
      orderBy: { expiresAt: 'asc' },
      take: this.batchSize(),
      select: { id: true },
    });
    if (sessions.length === 0) {
      return 0;
    }
    const ids = sessions.map(({ id }) => id);
    return this.database.$transaction(async (transaction) => {
      const expired = await transaction.authSession.updateMany({
        where: { id: { in: ids }, status: SessionStatus.ACTIVE },
        data: {
          status: SessionStatus.EXPIRED,
          revokedAt: now,
          revocationReason: 'SESSION_EXPIRED',
          version: { increment: 1 },
        },
      });
      await transaction.refreshToken.updateMany({
        where: { sessionId: { in: ids }, revokedAt: null },
        data: { revoked: true, revokedAt: now },
      });
      return expired.count;
    });
  }

  private async deleteRetainedSessions(now: Date): Promise<number> {
    return this.deleteByIds(
      'authSession',
      {
        status: {
          in: [
            SessionStatus.EXPIRED,
            SessionStatus.REVOKED,
            SessionStatus.COMPROMISED,
          ],
        },
        expiresAt: {
          lte: this.retentionCutoff(now, 'SESSION_RETENTION_DAYS'),
        },
      },
      { expiresAt: 'asc' },
    );
  }

  private async expireStaleAttempts(now: Date): Promise<number> {
    const attempts = await this.database.identityVerificationAttempt.findMany({
      where: {
        status: {
          in: [
            VerificationAttemptStatus.PENDING,
            VerificationAttemptStatus.MEDIA_PENDING,
            VerificationAttemptStatus.PROCESSING,
            VerificationAttemptStatus.PROVIDER_UNAVAILABLE,
          ],
        },
        startedAt: {
          lte: new Date(
            now.getTime() -
              this.config.get('STALE_VERIFICATION_ATTEMPT_HOURS', {
                infer: true,
              }) *
                3_600_000,
          ),
        },
      },
      orderBy: { startedAt: 'asc' },
      take: this.batchSize(),
      select: { id: true },
    });
    if (attempts.length === 0) return 0;
    const ids = attempts.map(({ id }) => id);
    return this.database.$transaction(async (transaction) => {
      const expired = await transaction.identityVerificationAttempt.updateMany({
        where: {
          id: { in: ids },
          status: {
            in: [
              VerificationAttemptStatus.PENDING,
              VerificationAttemptStatus.MEDIA_PENDING,
              VerificationAttemptStatus.PROCESSING,
              VerificationAttemptStatus.PROVIDER_UNAVAILABLE,
            ],
          },
        },
        data: {
          status: VerificationAttemptStatus.EXPIRED,
          completedAt: now,
          reasonCode: 'ATTEMPT_EXPIRED',
        },
      });
      await transaction.verificationMedia.updateMany({
        where: {
          verificationAttemptId: { in: ids },
          deletedAt: null,
          OR: [{ legalHoldUntil: null }, { legalHoldUntil: { lte: now } }],
        },
        data: { expiresAt: now, nextDeletionAttemptAt: now },
      });
      return expired.count;
    });
  }

  private async deleteRetainedSecurityEvents(now: Date): Promise<number> {
    const records = await this.database.authSecurityEvent.findMany({
      where: {
        createdAt: {
          lte: this.retentionCutoff(now, 'SECURITY_EVENT_RETENTION_DAYS'),
        },
        OR: [{ legalHoldUntil: null }, { legalHoldUntil: { lte: now } }],
      },
      orderBy: { createdAt: 'asc' },
      take: this.batchSize(),
      select: { id: true },
    });
    if (records.length === 0) return 0;
    const deleted = await this.database.authSecurityEvent.deleteMany({
      where: { id: { in: records.map(({ id }) => id) } },
    });
    return deleted.count;
  }

  private batchSize(): number {
    return this.config.get('OPERATIONAL_JOB_BATCH_SIZE', { infer: true });
  }

  private retentionCutoff(
    now: Date,
    key:
      | 'TOKEN_RETENTION_DAYS'
      | 'SESSION_RETENTION_DAYS'
      | 'SECURITY_EVENT_RETENTION_DAYS',
  ): Date {
    return new Date(
      now.getTime() - this.config.get(key, { infer: true }) * 24 * 3_600_000,
    );
  }
}
