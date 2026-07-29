import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import { AuthEnvironment } from '../../config/environment.validation';
import type { MailMessage, MailProvider } from './mail-provider';

@Injectable()
export class HttpMailAdapter implements MailProvider {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<AuthEnvironment, true>,
  ) {}

  async send(message: MailMessage): Promise<void> {
    await firstValueFrom(
      this.http.post(
        this.config.get('MAIL_PROVIDER_URL', { infer: true }),
        {
          from: this.config.get('MAIL_FROM', { infer: true }),
          to: message.recipient,
          subject: message.subject,
          text: message.text,
          html: message.html,
        },
        {
          headers: {
            authorization: `Bearer ${this.config.get('MAIL_API_KEY', {
              infer: true,
            })}`,
            'content-type': 'application/json',
            ...(message.deliveryId
              ? { 'idempotency-key': message.deliveryId }
              : {}),
          },
          maxRedirects: 0,
          timeout: this.config.get('MAIL_PROVIDER_TIMEOUT_MS', {
            infer: true,
          }),
        },
      ),
    );
  }
}
