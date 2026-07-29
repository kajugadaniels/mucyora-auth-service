import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import Joi from 'joi';

import { DatabaseService } from '../../common/database/database.service';
import { IdentityEncryptionService } from '../../common/security/identity-encryption.service';
import { AuthEnvironment } from '../../config/environment.validation';
import { ensureRedisConnected } from '../redis/redis-connection';
import { REDIS_CLIENT } from '../redis/redis.module';
import { MAIL_PROVIDER } from './mail-provider';
import type { MailProvider } from './mail-provider';
import { MailTemplateService } from './mail-template.service';

const LOCK_TTL_SECONDS = 60;
const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;
const payloadSchema = Joi.object({
  recipient: Joi.string().email().required(),
  tokenEncrypted: Joi.string().max(4_096),
}).unknown(false);

@Injectable()
export class MailOutboxWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly workerId = randomUUID();
  private timer?: NodeJS.Timeout;
  private dispatching = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService<AuthEnvironment, true>,
    private readonly encryption: IdentityEncryptionService,
    private readonly templates: MailTemplateService,
    @Inject(MAIL_PROVIDER) private readonly mailProvider: MailProvider,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
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
      const events = await this.database.outboxEvent.findMany({
        where: {
          publishedAt: null,
          attemptCount: { lt: 10 },
          eventType: {
            in: ['EMAIL_VERIFICATION_REQUESTED', 'WELCOME_NEXT_STEP'],
          },
        },
        orderBy: { createdAt: 'asc' },
        take: this.config.get('OUTBOX_BATCH_SIZE', { infer: true }),
        select: {
          id: true,
          eventType: true,
          payload: true,
        },
      });

      let published = 0;
      for (const event of events) {
        if (await this.dispatchEvent(event)) {
          published += 1;
        }
      }
      return published;
    } finally {
      this.dispatching = false;
    }
  }

  private async dispatchEvent(event: {
    id: string;
    eventType: string;
    payload: unknown;
  }): Promise<boolean> {
    await ensureRedisConnected(this.redis);
    const lockKey = `${this.config.get('CACHE_PREFIX', {
      infer: true,
    })}lock:outbox:${event.id}`;
    const lockValue = `${this.workerId}:${randomUUID()}`;
    const acquired = await this.redis.set(
      lockKey,
      lockValue,
      'EX',
      LOCK_TTL_SECONDS,
      'NX',
    );
    if (acquired !== 'OK') {
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
      const message =
        event.eventType === 'EMAIL_VERIFICATION_REQUESTED'
          ? this.templates.emailVerification(
              payload.recipient,
              this.encryption.open(
                payload.tokenEncrypted ?? '',
                'email-verification-token',
              ),
            )
          : this.templates.welcome(payload.recipient);

      await this.mailProvider.send(message);
      await this.database.outboxEvent.updateMany({
        where: { id: event.id, publishedAt: null },
        data: {
          publishedAt: new Date(),
          attemptCount: { increment: 1 },
          lastError: null,
        },
      });
      return true;
    } catch {
      await this.database.outboxEvent.updateMany({
        where: { id: event.id, publishedAt: null },
        data: {
          attemptCount: { increment: 1 },
          lastError: 'MAIL_DELIVERY_FAILED',
        },
      });
      return false;
    } finally {
      await this.redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, lockValue);
    }
  }
}
