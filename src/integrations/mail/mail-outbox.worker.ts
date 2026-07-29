import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Joi from 'joi';

import { DatabaseService } from '../../common/database/database.service';
import { DistributedJobLockService } from '../../common/operations/distributed-job-lock.service';
import { IdentityEncryptionService } from '../../common/security/identity-encryption.service';
import { AuthEnvironment } from '../../config/environment.validation';
import { MAIL_PROVIDER } from './mail-provider';
import type { MailProvider } from './mail-provider';
import { MailTemplateService } from './mail-template.service';

const payloadSchema = Joi.object({
  recipient: Joi.string().email().required(),
  tokenEncrypted: Joi.string().max(4_096),
}).unknown(false);

@Injectable()
export class MailOutboxWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly workerId = `mail-${process.pid}`;
  private timer?: NodeJS.Timeout;
  private dispatching = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService<AuthEnvironment, true>,
    private readonly encryption: IdentityEncryptionService,
    private readonly templates: MailTemplateService,
    @Inject(MAIL_PROVIDER) private readonly mailProvider: MailProvider,
    private readonly locks: DistributedJobLockService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('MAIL_OUTBOX_WORKER_ENABLED', { infer: true })) {
      return;
    }
    this.timer = setInterval(
      () => {
        void this.dispatchBatch();
      },
      this.config.get('OUTBOX_POLL_INTERVAL_MS', { infer: true }),
    );
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async dispatchBatch(): Promise<number> {
    if (this.dispatching) {
      return 0;
    }
    this.dispatching = true;

    try {
      const result = await this.locks.runExclusive(
        'mail-outbox-batch',
        this.config.get('OPERATIONAL_JOB_LOCK_TTL_SECONDS', { infer: true }),
        () => this.dispatchAvailableEvents(),
      );
      return result ?? 0;
    } finally {
      this.dispatching = false;
    }
  }

  private async dispatchAvailableEvents(): Promise<number> {
    const now = new Date();
    const events = await this.database.outboxEvent.findMany({
      where: {
        publishedAt: null,
        deadLetteredAt: null,
        nextAttemptAt: { lte: now },
        attemptCount: {
          lt: this.config.get('OUTBOX_MAX_ATTEMPTS', { infer: true }),
        },
        OR: [
          { processingStartedAt: null },
          {
            processingStartedAt: {
              lte: new Date(
                now.getTime() -
                  this.config.get('OUTBOX_LEASE_SECONDS', { infer: true }) *
                    1_000,
              ),
            },
          },
        ],
        eventType: {
          in: [
            'EMAIL_VERIFICATION_REQUESTED',
            'WELCOME_NEXT_STEP',
            'PASSWORD_RESET_REQUESTED',
            'PASSWORD_CHANGED_NOTIFICATION',
          ],
        },
      },
      orderBy: { createdAt: 'asc' },
      take: this.config.get('OUTBOX_BATCH_SIZE', { infer: true }),
      select: {
        id: true,
        eventType: true,
        payload: true,
        attemptCount: true,
      },
    });

    let published = 0;
    for (const event of events) {
      if (await this.dispatchEvent(event)) {
        published += 1;
      }
    }
    return published;
  }

  private async dispatchEvent(event: {
    id: string;
    eventType: string;
    payload: unknown;
    attemptCount: number;
  }): Promise<boolean> {
    const now = new Date();
    const claimed = await this.database.outboxEvent.updateMany({
      where: {
        id: event.id,
        publishedAt: null,
        deadLetteredAt: null,
        nextAttemptAt: { lte: now },
        OR: [
          { processingStartedAt: null },
          {
            processingStartedAt: {
              lte: new Date(
                now.getTime() -
                  this.config.get('OUTBOX_LEASE_SECONDS', { infer: true }) *
                    1_000,
              ),
            },
          },
        ],
      },
      data: {
        processingStartedAt: now,
        processingBy: this.workerId,
      },
    });
    if (claimed.count !== 1) {
      return false;
    }

    try {
      const validation = payloadSchema.validate(event.payload, {
        convert: false,
      });
      if (validation.error) {
        throw new Error('Invalid outbox payload');
      }
      const payload = validation.value as {
        recipient: string;
        tokenEncrypted?: string;
      };
      const message = this.messageFor(event.eventType, payload);

      await this.mailProvider.send({ ...message, deliveryId: event.id });
      await this.database.outboxEvent.updateMany({
        where: {
          id: event.id,
          publishedAt: null,
          processingBy: this.workerId,
        },
        data: {
          publishedAt: new Date(),
          attemptCount: { increment: 1 },
          lastError: null,
          processingStartedAt: null,
          processingBy: null,
        },
      });
      return true;
    } catch {
      const attemptCount = event.attemptCount + 1;
      const deadLettered =
        attemptCount >= this.config.get('OUTBOX_MAX_ATTEMPTS', { infer: true });
      await this.database.outboxEvent.updateMany({
        where: {
          id: event.id,
          publishedAt: null,
          processingBy: this.workerId,
        },
        data: {
          attemptCount: { increment: 1 },
          lastError: 'MAIL_DELIVERY_FAILED',
          nextAttemptAt: new Date(
            Date.now() + this.retryDelayMilliseconds(event.attemptCount),
          ),
          processingStartedAt: null,
          processingBy: null,
          ...(deadLettered ? { deadLetteredAt: new Date() } : {}),
        },
      });
      return false;
    }
  }

  private retryDelayMilliseconds(attemptCount: number): number {
    const base = this.config.get('OUTBOX_RETRY_BASE_SECONDS', { infer: true });
    const maximum = this.config.get('OUTBOX_RETRY_MAX_SECONDS', {
      infer: true,
    });
    return Math.min(maximum, base * 2 ** Math.min(attemptCount, 10)) * 1_000;
  }

  private messageFor(
    eventType: string,
    payload: { recipient: string; tokenEncrypted?: string },
  ) {
    if (eventType === 'EMAIL_VERIFICATION_REQUESTED') {
      return this.templates.emailVerification(
        payload.recipient,
        this.encryption.open(
          payload.tokenEncrypted ?? '',
          'email-verification-token',
        ),
      );
    }
    if (eventType === 'PASSWORD_RESET_REQUESTED') {
      return this.templates.passwordReset(
        payload.recipient,
        this.encryption.open(
          payload.tokenEncrypted ?? '',
          'password-reset-token',
        ),
      );
    }
    if (eventType === 'PASSWORD_CHANGED_NOTIFICATION') {
      return this.templates.passwordChanged(payload.recipient);
    }
    return this.templates.welcome(payload.recipient);
  }
}
