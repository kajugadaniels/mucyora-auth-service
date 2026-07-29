import { BadRequestException, Injectable } from '@nestjs/common';

import { IdentityEncryptionService } from '../../common/security/identity-encryption.service';

const TOKEN_PREFIX = 'mrc1.';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class RegistrationChallengeTokenService {
  constructor(private readonly encryption: IdentityEncryptionService) {}

  issue(challengeId: string): string {
    if (!UUID_PATTERN.test(challengeId)) {
      throw new RangeError('Registration challenge identifier is invalid.');
    }

    const envelope = this.encryption.seal(
      challengeId,
      'registration-challenge-token',
    );
    return `${TOKEN_PREFIX}${Buffer.from(envelope, 'utf8').toString(
      'base64url',
    )}`;
  }

  resolve(token: string): string {
    if (
      typeof token !== 'string' ||
      token.length < 64 ||
      token.length > 2_048 ||
      !token.startsWith(TOKEN_PREFIX)
    ) {
      throw this.invalidToken();
    }

    try {
      const envelope = Buffer.from(
        token.slice(TOKEN_PREFIX.length),
        'base64url',
      ).toString('utf8');
      const challengeId = this.encryption.open(
        envelope,
        'registration-challenge-token',
      );

      if (!UUID_PATTERN.test(challengeId)) {
        throw new Error('Invalid challenge identifier');
      }

      return challengeId;
    } catch {
      throw this.invalidToken();
    }
  }

  private invalidToken(): BadRequestException {
    return new BadRequestException({
      code: 'REGISTRATION_CHALLENGE_INVALID',
      message: 'The registration challenge is invalid or unavailable.',
    });
  }
}
