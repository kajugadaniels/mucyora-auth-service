import { KeyedDigestService } from './keyed-digest.service';
import { TokenService } from './token.service';

describe('TokenService', () => {
  it('generates at least 256 bits and stores only a derived digest', () => {
    const digest = jest.fn((value: string) => `digest:${value.length}`);
    const digests = { token: digest } as unknown as KeyedDigestService;
    const service = new TokenService(digests);

    const first = service.generate();
    const second = service.generate();

    expect(Buffer.from(first.token, 'base64url')).toHaveLength(32);
    expect(first.digest).toBe(`digest:${first.token.length}`);
    expect(first.token).not.toBe(second.token);
    expect(digest).toHaveBeenCalledTimes(2);
  });

  it('rejects undersized token requests', () => {
    const service = new TokenService({
      token: jest.fn(),
    } as unknown as KeyedDigestService);

    expect(() => service.generate(16)).toThrow('between 32 and 64');
  });
});
