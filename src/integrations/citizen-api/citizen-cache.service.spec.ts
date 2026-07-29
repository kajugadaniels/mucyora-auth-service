import type Redis from 'ioredis';

import { RedisCitizenCache } from './citizen-cache.service';

describe('RedisCitizenCache', () => {
  it('connects lazily and writes expiring positive-cache values', async () => {
    const connect = jest.fn().mockResolvedValue(undefined);
    const set = jest.fn().mockResolvedValue('OK');
    const redis = {
      status: 'wait',
      connect,
      get: jest.fn().mockResolvedValue('encrypted'),
      set,
      del: jest.fn().mockResolvedValue(1),
      disconnect: jest.fn(),
    } as unknown as Redis;
    const cache = new RedisCitizenCache(redis);

    await expect(cache.get('safe-key')).resolves.toBe('encrypted');
    await cache.set('safe-key', 'ciphertext', 300);
    await cache.delete('safe-key');

    expect(connect).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith('safe-key', 'ciphertext', 'EX', 300);
  });
});
