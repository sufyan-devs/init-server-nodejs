import { redisClient, getIsConnected } from '@utils/redisClient';

const assertConnected = (): void => {
  if (!getIsConnected()) throw new Error("Redis not connected");
};

const assertKey = (key: string): void => {
  if (!key || key.trim() === "") throw new Error("Redis key cannot be empty");
};

export const sessionKey = (sid: string): string => `sess:${sid}`;
export const userSessionsKey = (userId: string): string => `user:${userId}:sessions`;
export const loginFailKey = (userId: string): string => `login:fail:${userId}`;
export const loginLockKey = (userId: string): string => `login:lock:${userId}`;

export async function setKey(key: string, value: string, ttlSeconds?: number): Promise<void> {
  assertConnected();
  assertKey(key);
  if (ttlSeconds === undefined) {
    await redisClient.set(key, value);
    return;
  }
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error(`Refusing to set ${key}: TTL must be a positive number, got ${ttlSeconds}`);
  }
  await redisClient.set(key, value, { EX: ttlSeconds });
}

// Rewrites a value and leaves the expiry alone. Plain SET clears the TTL, and
// SET ... EX resets it — either would let a background update extend a session.
export async function setKeyKeepTtl(key: string, value: string): Promise<void> {
  assertConnected();
  assertKey(key);
  await redisClient.set(key, value, { KEEPTTL: true });
}

export async function getKey(key: string): Promise<string | null> {
  assertConnected();
  assertKey(key);
  return await redisClient.get(key);
}

export async function delKey(...keys: string[]): Promise<number> {
  assertConnected();
  if (keys.length === 0) return 0;
  keys.forEach(assertKey);
  return await redisClient.del(keys);
}

export async function incrementKey(key: string): Promise<number> {
  assertConnected();
  assertKey(key);
  return await redisClient.incr(key);
}

export async function getTTL(key: string): Promise<number> {
  assertConnected();
  assertKey(key);
  return await redisClient.ttl(key);
}

export async function expireKey(key: string, ttlSeconds: number): Promise<void> {
  assertConnected();
  assertKey(key);
  if (ttlSeconds > 0) await redisClient.expire(key, ttlSeconds);
}

export async function addToSet(key: string, ...members: string[]): Promise<void> {
  assertConnected();
  assertKey(key);
  if (members.length === 0) return;
  await redisClient.sAdd(key, members);
}

export async function removeFromSet(key: string, ...members: string[]): Promise<void> {
  assertConnected();
  assertKey(key);
  if (members.length === 0) return;
  await redisClient.sRem(key, members);
}

export async function getSetMembers(key: string): Promise<string[]> {
  assertConnected();
  assertKey(key);
  return await redisClient.sMembers(key);
}

export async function getManyKeys(keys: string[]): Promise<(string | null)[]> {
  assertConnected();
  if (keys.length === 0) return [];
  keys.forEach(assertKey);
  return await redisClient.mGet(keys);
}

export interface CounterHit {
  count: number;
  ttlSeconds: number;
}

export async function incrementWithTTL(
  keys: string[],
  ttlSeconds: number,
): Promise<CounterHit[]> {
  assertConnected();
  if (keys.length === 0) return [];
  keys.forEach(assertKey);

  const batch = redisClient.multi();
  for (const key of keys) {
    batch.incr(key);
    // NX, not a plain EXPIRE: an unconditional one renews the window on every hit, so a client
    // hammering a blocked endpoint never unblocks. Requires Redis >= 7.0.
    batch.expire(key, ttlSeconds, 'NX');
    batch.ttl(key);
  }
  const replies = await batch.exec();

  if (!replies || replies.length !== keys.length * 3) {
    throw new Error(
      `Redis pipeline returned ${replies ? replies.length : 'null'} replies for ${keys.length} counters`,
    );
  }

  return keys.map((_key, index) => {
    const base = index * 3;
    const count = Number(replies[base]);
    const ttl = Number(replies[base + 2]);
    if (!Number.isFinite(count) || count < 1) {
      throw new Error('Redis INCR returned a non-positive count; reading is unusable');
    }
    return { count, ttlSeconds: Number.isFinite(ttl) ? ttl : 0 };
  });
}
