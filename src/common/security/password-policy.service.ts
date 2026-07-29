import { BadRequestException, Injectable } from '@nestjs/common';
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
    await this.acquire();

    try {
      return await argon2.hash(password, this.options());
    } finally {
      this.release();
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
