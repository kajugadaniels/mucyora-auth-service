import type Redis from 'ioredis';

const connectionAttempts = new WeakMap<Redis, Promise<void>>();

export async function ensureRedisConnected(redis: Redis): Promise<void> {
  if (redis.status === 'ready') {
    return;
  }

  const existing = connectionAttempts.get(redis);
  if (existing) {
    return existing;
  }

  if (redis.status !== 'wait') {
    throw new Error('Redis is not ready');
  }

  const attempt = redis.connect().finally(() => {
    connectionAttempts.delete(redis);
  });
  connectionAttempts.set(redis, attempt);
  return attempt;
}
