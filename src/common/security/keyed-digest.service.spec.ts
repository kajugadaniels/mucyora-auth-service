import { ConfigService } from '@nestjs/config';
import { KeyedDigestService } from './keyed-digest.service';

describe('KeyedDigestService', () => {
  it('matches the versioned identity lookup test vector', () => {
    const service = new KeyedDigestService(
      new ConfigService({
        IDENTITY_LOOKUP_KEY_VERSION: 'v1',
        IDENTITY_LOOKUP_HMAC_KEY: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE',
        TOKEN_DIGEST_HMAC_KEY: 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI',
        REQUEST_CONTEXT_HMAC_KEY: 'AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM',
      }),
    );

    expect(service.identityLookup('1000000000000001')).toBe(
      'v1:JfJVOLcVM_0Ca8YMUI7PD0Q-Hq8WVjQg5OFOtfW5W_Y',
    );
  });

  it('separates identity, token, and request-context domains', () => {
    const service = new KeyedDigestService(
      new ConfigService({
        IDENTITY_LOOKUP_KEY_VERSION: 'v1',
        IDENTITY_LOOKUP_HMAC_KEY: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE',
        TOKEN_DIGEST_HMAC_KEY: 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI',
        REQUEST_CONTEXT_HMAC_KEY: 'AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM',
      }),
    );

    const value = 'synthetic-input';
    expect(
      new Set([
        service.identityLookup(value),
        service.token(value),
        service.requestContext(value),
      ]).size,
    ).toBe(3);
  });
});
