import { ConfigService } from '@nestjs/config';
import argon2 from 'argon2';

import { AuthEnvironment } from '../../config/environment.validation';
import { PasswordPolicyService } from './password-policy.service';

describe('PasswordPolicyService', () => {
  const service = new PasswordPolicyService(
    new ConfigService<Partial<AuthEnvironment>>({
      PASSWORD_ARGON2_MEMORY_KIB: 32_768,
      PASSWORD_ARGON2_TIME_COST: 2,
      PASSWORD_ARGON2_PARALLELISM: 1,
      PASSWORD_HASH_MAX_CONCURRENCY: 2,
    }) as ConfigService<AuthEnvironment, true>,
  );

  it('creates an Argon2id hash for an acceptable passphrase', async () => {
    const password = 'Maple river lantern voyage 47!';
    const hash = await service.hash(password, 'person@example.com');

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(argon2.verify(hash, password)).resolves.toBe(true);
  });

  it('rejects short, common, and email-derived passwords', () => {
    expect(() =>
      service.assertAcceptable('too-short', 'person@example.com'),
    ).toThrow('15–128');
    expect(() =>
      service.assertAcceptable(
        'correct horse battery staple',
        'person@example.com',
      ),
    ).toThrow('not commonly used');
    expect(() =>
      service.assertAcceptable(
        'person has a very long password',
        'person@example.com',
      ),
    ).toThrow('based on your email');
  });
});
