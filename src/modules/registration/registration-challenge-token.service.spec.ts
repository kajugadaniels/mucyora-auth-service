import { IdentityEncryptionService } from '../../common/security/identity-encryption.service';
import { RegistrationChallengeTokenService } from './registration-challenge-token.service';

describe('RegistrationChallengeTokenService', () => {
  const challengeId = '123e4567-e89b-42d3-a456-426614174000';

  it('issues an opaque token and resolves its encrypted identifier', () => {
    const encryption = {
      seal: jest.fn().mockReturnValue(`{"ciphertext":"${'A'.repeat(64)}"}`),
      open: jest.fn().mockReturnValue(challengeId),
    } as unknown as IdentityEncryptionService;
    const service = new RegistrationChallengeTokenService(encryption);

    const token = service.issue(challengeId);

    expect(token).toMatch(/^mrc1\.[A-Za-z0-9_-]+$/);
    expect(token).not.toContain(challengeId);
    expect(service.resolve(token)).toBe(challengeId);
  });

  it('returns the same safe error for malformed and unreadable tokens', () => {
    const encryption = {
      seal: jest.fn(),
      open: jest.fn().mockImplementation(() => {
        throw new Error('ciphertext failed');
      }),
    } as unknown as IdentityEncryptionService;
    const service = new RegistrationChallengeTokenService(encryption);

    expect(() => service.resolve('invalid')).toThrow(
      'The registration challenge is invalid or unavailable.',
    );
    expect(() => service.resolve(`mrc1.${'A'.repeat(100)}`)).toThrow(
      'The registration challenge is invalid or unavailable.',
    );
  });
});
