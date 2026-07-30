import { ConfigService } from '@nestjs/config';
import argon2 from 'argon2';
import { createHash } from 'node:crypto';

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

  it('screens only a five-character k-anonymity prefix', async () => {
    const password = 'Imisozi yacu iteka 2026!';
    const digest = createHash('sha1')
      .update(password)
      .digest('hex')
      .toUpperCase();
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(`${digest.slice(5)}:4\nOTHER:1`));
    const screened = new PasswordPolicyService(
      new ConfigService<Partial<AuthEnvironment>>({
        PASSWORD_ARGON2_MEMORY_KIB: 32_768,
        PASSWORD_ARGON2_TIME_COST: 2,
        PASSWORD_ARGON2_PARALLELISM: 1,
        PASSWORD_HASH_MAX_CONCURRENCY: 2,
        COMPROMISED_PASSWORD_CHECK_ENABLED: true,
        COMPROMISED_PASSWORD_API_URL: 'https://api.pwnedpasswords.com/range',
        COMPROMISED_PASSWORD_TIMEOUT_MS: 2_000,
      }) as ConfigService<AuthEnvironment, true>,
    );

    await expect(screened.assertNotCompromised(password)).rejects.toThrow(
      'known credential breaches',
    );
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://api.pwnedpasswords.com/range/${digest.slice(0, 5)}`,
    );
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(password);
    fetchMock.mockRestore();
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
