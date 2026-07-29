import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthEnvironment } from '../../config/environment.validation';
import type { MailMessage } from './mail-provider';

@Injectable()
export class MailTemplateService {
  constructor(private readonly config: ConfigService<AuthEnvironment, true>) {}

  emailVerification(recipient: string, token: string): MailMessage {
    const actionUrl = new URL(
      '/verify-email',
      this.config.get('MUCYORA_USER_APP_URL', { infer: true }),
    );
    actionUrl.searchParams.set('token', token);
    const escapedUrl = escapeHtml(actionUrl.toString());

    return {
      recipient,
      subject: 'Verify your MUCYORA email',
      text: `Verify your email by opening this link: ${actionUrl.toString()}`,
      html: `<p>Complete your MUCYORA registration by verifying your email.</p><p><a href="${escapedUrl}">Verify email</a></p>`,
    };
  }

  welcome(recipient: string): MailMessage {
    return {
      recipient,
      subject: 'Your MUCYORA email is verified',
      text: 'Your email is verified. Continue with identity verification in MUCYORA.',
      html: '<p>Your email is verified.</p><p>Continue with identity verification in MUCYORA.</p>',
    };
  }

  passwordReset(recipient: string, token: string): MailMessage {
    const actionUrl = new URL(
      '/reset-password',
      this.config.get('MUCYORA_USER_APP_URL', { infer: true }),
    );
    actionUrl.searchParams.set('token', token);
    const escapedUrl = escapeHtml(actionUrl.toString());

    return {
      recipient,
      subject: 'Reset your MUCYORA password',
      text: `Reset your password by opening this link: ${actionUrl.toString()}`,
      html: `<p>A password reset was requested for your MUCYORA account.</p><p><a href="${escapedUrl}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
    };
  }

  passwordChanged(recipient: string): MailMessage {
    return {
      recipient,
      subject: 'Your MUCYORA password was changed',
      text: 'Your MUCYORA password was changed. If this was not you, contact support immediately.',
      html: '<p>Your MUCYORA password was changed.</p><p>If this was not you, contact support immediately.</p>',
    };
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
