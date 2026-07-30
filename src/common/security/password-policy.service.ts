import { createHash } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import argon2 from 'argon2';
import type { HashOptions } from 'argon2';

import { AuthEnvironment } from '../../config/environment.validation';

const COMMON_PASSWORDS = new Set([
  '123456789012345',
  'correct horse battery staple',
  'iloveyouiloveyou',
  'letmeinletmeinletmein',
  'mucyoramucyora',
  'passwordpassword',
  'qwertyqwertyqwerty',
  'welcome123456789',
]);

@Injectable()
export class PasswordPolicyService {
  private activeHashes = 0;
  private readonly waiters: Array<() => void> = [];
  private readonly dummyHash: Promise<string>;

  constructor(private readonly config: ConfigService<AuthEnvironment, true>) {
    this.dummyHash = argon2.hash(
      'MUCYORA synthetic unavailable credential 2026',
      this.options(),
    );
  }

  async hash(password: string, emailNormalized: string): Promise<string> {
    this.assertAcceptable(password, emailNormalized);
    await this.assertNotCompromised(password);
    await this.acquire();

    try {
      return await argon2.hash(password, this.options());
    } finally {
      this.release();
    }
  }

  async assertNotCompromised(password: string): Promise<void> {
    if (
      !this.config.get('COMPROMISED_PASSWORD_CHECK_ENABLED', { infer: true })
    ) {
      return;
    }
    const digest = createHash('sha1')
      .update(password, 'utf8')
      .digest('hex')
      .toUpperCase();
    const prefix = digest.slice(0, 5);
    const suffix = digest.slice(5);
    try {
      const response = await fetch(
        `${this.config.get('COMPROMISED_PASSWORD_API_URL', {
          infer: true,
        })}/${prefix}`,
        {
          headers: {
            'Add-Padding': 'true',
            'User-Agent': 'mucyora-auth-password-screening',
          },
          signal: AbortSignal.timeout(
            this.config.get('COMPROMISED_PASSWORD_TIMEOUT_MS', {
              infer: true,
            }),
          ),
        },
      );
      if (!response.ok) throw new Error('screening unavailable');
      const compromised = (await response.text())
        .split(/\r?\n/)
        .some((line) => line.split(':', 1)[0] === suffix);
      if (compromised) {
        throw new BadRequestException({
          code: 'PASSWORD_COMPROMISED',
          message:
            'Choose a password that has not appeared in known credential breaches.',
        });
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new ServiceUnavailableException({
        code: 'PASSWORD_SCREENING_UNAVAILABLE',
        message: 'Password validation is temporarily unavailable.',
      });
    }
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  async verifyDummy(password: string): Promise<void> {
    await this.verify(await this.dummyHash, password);
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, this.options());
  }

  assertAcceptable(password: string, emailNormalized: string): void {
    const length = Array.from(password).length;
    const lowered = password.toLocaleLowerCase('en');
    const emailLocalPart = emailNormalized.split('@', 1)[0];

    if (
      length < 15 ||
      length > 128 ||
      COMMON_PASSWORDS.has(lowered) ||
      (emailLocalPart.length >= 4 && lowered.includes(emailLocalPart))
    ) {
      throw new BadRequestException({
        code: 'PASSWORD_POLICY_FAILED',
        message:
          'Choose a password of 15–128 characters that is not commonly used or based on your email.',
      });
    }
  }

  private async acquire(): Promise<void> {
    const maximum = this.config.get('PASSWORD_HASH_MAX_CONCURRENCY', {
      infer: true,
    });
    if (this.activeHashes >= maximum) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.activeHashes += 1;
  }

  private release(): void {
    this.activeHashes -= 1;
    this.waiters.shift()?.();
  }

  private options(): HashOptions & { raw?: false } {
    return {
      type: argon2.argon2id,
      memoryCost: this.config.get('PASSWORD_ARGON2_MEMORY_KIB', {
        infer: true,
      }),
      timeCost: this.config.get('PASSWORD_ARGON2_TIME_COST', { infer: true }),
      parallelism: this.config.get('PASSWORD_ARGON2_PARALLELISM', {
        infer: true,
      }),
    };
  }
}
