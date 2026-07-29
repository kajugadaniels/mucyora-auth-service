import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { KeyedDigestService } from './keyed-digest.service';

export interface GeneratedOpaqueToken {
  token: string;
  digest: string;
}

@Injectable()
export class TokenService {
  constructor(private readonly digests: KeyedDigestService) {}

  generate(bytes = 32): GeneratedOpaqueToken {
    if (!Number.isInteger(bytes) || bytes < 32 || bytes > 64) {
      throw new RangeError(
        'Opaque tokens must contain between 32 and 64 bytes.',
      );
    }

    const token = randomBytes(bytes).toString('base64url');
    return {
      token,
      digest: this.digests.token(token),
    };
  }

  digest(token: string): string {
    return this.digests.token(token);
  }
}
