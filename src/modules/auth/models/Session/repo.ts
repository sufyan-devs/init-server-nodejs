import {
  sessionKey,
  userSessionsKey,
  setKey,
  setKeyKeepTtl,
  getKey,
  delKey,
  getTTL,
  expireKey,
  addToSet,
  removeFromSet,
  getSetMembers,
  getManyKeys,
} from '@utils/redisKeys';
import { logger } from '@utils/logger';
import type { SessionRecord, SessionRepo } from './types';

const TTL_REFRESH_FRACTION = 0.5;

const CREATED_AT_UNKNOWN = 0;

interface SessionIndexEntry {
  sid: string;
  raw: string;
}

interface SessionIndex {
  setKeyName: string;
  entries: SessionIndexEntry[];
  expired: string[];
}

const parseSession = (raw: string | null, sid: string): SessionRecord | null => {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      logger.error('Session: stored value is not an object, ignoring', { sid });
      return null;
    }
    return parsed as SessionRecord;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Session: corrupt JSON in Redis, ignoring', { sid, error: message });
    return null;
  }
};

const extendAtLeast = async (key: string, ttlSeconds: number): Promise<void> => {
  if (ttlSeconds <= 0) return;
  // -2 = key gone, -1 = key has no expiry. Both need one set now.
  const current = await getTTL(key);
  if (current === -2) return;
  if (current < ttlSeconds) await expireKey(key, ttlSeconds);
};

const readRawSessions = async (sids: string[]): Promise<(string | null)[]> => {
  if (sids.length === 0) return [];
  return getManyKeys(sids.map(sessionKey));
};

// SMEMBERS then one MGET: the per-user SET is the index, so never a KEYS scan or a read per sid.
const readSessionIndex = async (userId: string): Promise<SessionIndex> => {
  const setKeyName = userSessionsKey(userId);
  const sids = await getSetMembers(setKeyName);
  if (sids.length === 0) return { setKeyName, entries: [], expired: [] };

  const values = await readRawSessions(sids);
  const entries: SessionIndexEntry[] = [];
  const expired: string[] = [];
  sids.forEach((sid, index) => {
    const raw = values[index];
    if (raw === null) expired.push(sid);
    else entries.push({ sid, raw });
  });

  return { setKeyName, entries, expired };
};

const save = async (session: SessionRecord, ttlSeconds: number): Promise<void> => {
  await setKey(sessionKey(session.sid), JSON.stringify(session), ttlSeconds);
  await addToSet(userSessionsKey(session.userId), session.sid);
  await extendAtLeast(userSessionsKey(session.userId), ttlSeconds);
};

const saveFields = async (session: SessionRecord): Promise<void> => {
  await setKeyKeepTtl(sessionKey(session.sid), JSON.stringify(session));
};

const findBySid = async (sid: string): Promise<SessionRecord | null> =>
  parseSession(await getKey(sessionKey(sid)), sid);

const findManyBySids = async (sids: string[]): Promise<Array<SessionRecord | null>> => {
  const values = await readRawSessions(sids);
  return values.map((raw, index) => parseSession(raw, sids[index]));
};

const deleteBySid = async (sid: string, userId: string): Promise<void> => {
  await delKey(sessionKey(sid));
  await removeFromSet(userSessionsKey(userId), sid);
};

const listSidsByUser = async (userId: string): Promise<string[]> => {
  const { setKeyName, entries, expired } = await readSessionIndex(userId);
  if (expired.length > 0) await removeFromSet(setKeyName, ...expired);
  return entries.map((entry) => entry.sid);
};

const deleteAllForUser = async (userId: string): Promise<void> => {
  const setKeyName = userSessionsKey(userId);
  const sids = await getSetMembers(setKeyName);
  await delKey(...sids.map(sessionKey), setKeyName);
};

const refreshTtlIfStale = async (sid: string, ttlSeconds: number): Promise<void> => {
  if (ttlSeconds <= 0) return;

  const key = sessionKey(sid);
  const remaining = await getTTL(key);
  if (remaining < 0) return;
  if (remaining >= ttlSeconds * TTL_REFRESH_FRACTION) return;

  await expireKey(key, ttlSeconds);

  const session = await findBySid(sid);
  if (!session) return;
  await extendAtLeast(userSessionsKey(session.userId), ttlSeconds);
};

const pruneToLimit = async (userId: string, max: number): Promise<string[]> => {
  if (max <= 0) return [];

  const { setKeyName, entries, expired } = await readSessionIndex(userId);
  const excess = entries.length - max;

  let evicted: string[] = [];
  if (excess > 0) {
    evicted = entries
      .map((entry) => {
        const session = parseSession(entry.raw, entry.sid);
        const createdAt =
          session && typeof session.createdAt === 'number' ? session.createdAt : CREATED_AT_UNKNOWN;
        return { sid: entry.sid, createdAt };
      })
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, excess)
      .map((entry) => entry.sid);

    await delKey(...evicted.map(sessionKey));
  }

  const deIndex = [...evicted, ...expired];
  if (deIndex.length > 0) await removeFromSet(setKeyName, ...deIndex);

  return evicted;
};

const sessionRepo: SessionRepo = {
  save,
  findBySid,
  findManyBySids,
  deleteBySid,
  listSidsByUser,
  deleteAllForUser,
  saveFields,
  refreshTtlIfStale,
  pruneToLimit,
};

export default sessionRepo;
