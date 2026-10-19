import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import sessionRepo, {
  SESSION_INVALID_REASON,
  SESSION_REVOKE_REASON,
} from '@auth/models/Session';
import type {
  CreateSessionInput,
  CreatedSession,
  SessionDevice,
  SessionInvalidReason,
  SessionRecord,
  SessionRevokeReason,
  SessionUser,
  VerifySessionResult,
} from '@auth/models/Session';
import { envConfig } from '@config/env';
import AUTH_ERRORS from '@constants/authErrors';
import ApiError from '@utils/apiError';
import { logger } from '@utils/logger';
import { setKey, getKey, delKey, resetSessionKey } from '@utils/redisKeys';
import { portalOf } from '@utils/cookieHelper';
import { errorMessage } from '@utils/format';

const TOKEN_SEPARATOR = '.';
const TOKEN_PART_COUNT = 2;
const SID_BYTES = 16;
const SECRET_BYTES = 32;
const RESET_ID_BYTES = 32;
const MS_PER_SECOND = 1000;
const RESET_TTL_SECONDS = envConfig.PASSWORD_RESET.SESSION_EXPIRY_MINUTES * 60;

const randomBytesAsync = promisify(randomBytes);

const randomHex = async (bytes: number): Promise<string> =>
  (await randomBytesAsync(bytes)).toString('hex');

const sessionTtlSeconds = (): number =>
  Math.floor(envConfig.SESSION.EXPIRY_MS / MS_PER_SECOND);

const sha256Hex = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const invalid = (reason: SessionInvalidReason): VerifySessionResult => ({
  valid: false,
  reason,
});

const digestsMatch = (candidate: string, stored: string): boolean => {
  const left = Buffer.from(candidate, 'utf8');
  const right = Buffer.from(stored, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
};

const toDevice = (session: SessionRecord, currentSid?: string): SessionDevice => ({
  sid: session.sid,
  activeRole: session.activeRole,
  portal: session.portal,
  ipAddress: session.ipAddress,
  userAgent: session.userAgent,
  deviceInfo: session.deviceInfo,
  createdAt: session.createdAt,
  lastSeenAt: session.lastSeenAt,
  current: currentSid !== undefined && session.sid === currentSid,
});

const absoluteDeadline = (session: SessionRecord): number =>
  session.createdAt + envConfig.SESSION.ABSOLUTE_MAX_MS;

// Fire-and-forget: the hot path never waits, and the repo writes only when half the TTL is gone.
const touchTtl = (session: SessionRecord, remainingSeconds: number): void => {
  const untilDeadline = Math.floor(
    (absoluteDeadline(session) - Date.now()) / MS_PER_SECOND,
  );
  void sessionRepo
    .refreshIfStale(session, remainingSeconds, Math.min(sessionTtlSeconds(), untilDeadline))
    .catch((error: unknown) => {
      logger.warn('Session TTL refresh failed', { sid: session.sid, error: errorMessage(error) });
    });
};

// The cookie must die exactly when the session does. Kept here, beside absoluteDeadline,
// so the 30-day cap is expressed once rather than once per consumer.
const cookieMaxAgeMs = (session: SessionRecord): number =>
  Math.max(0, Math.min(envConfig.SESSION.COOKIE.MAX_AGE_MS, absoluteDeadline(session) - Date.now()));

const dropExpired = (sid: string, userId: string): void => {
  void sessionRepo.deleteBySid(sid, userId).catch((error: unknown) => {
    logger.warn('Expired session delete failed', { sid, error: errorMessage(error) });
  });
};

const pruneToCap = (userId: string): void => {
  void sessionRepo
    .pruneToLimit(userId, envConfig.SESSION.MAX_PER_USER)
    .then((evicted: string[]) => {
      if (evicted.length === 0) return;
      logger.info('Sessions evicted over cap', { userId, evicted: evicted.length });
    })
    .catch((error: unknown) => {
      logger.warn('Session prune failed', { userId, error: errorMessage(error) });
    });
};

interface DisplayFieldSource {
  email: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  profileImage?: string | null;
}

const toSessionUser = (user: DisplayFieldSource): SessionUser => ({
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  emailVerified: user.emailVerified,
  profileImage: user.profileImage ?? null,
});

const createSession = async (input: CreateSessionInput): Promise<CreatedSession> => {
  const [sid, secret] = await Promise.all([
    randomHex(SID_BYTES),
    randomHex(SECRET_BYTES),
  ]);
  const now = Date.now();

  const session: SessionRecord = {
    sid,
    secretHash: sha256Hex(secret),
    userId: input.userId,
    user: input.user,
    activeRole: input.activeRole,
    availableRoles: input.availableRoles,
    portal: input.portal,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    deviceInfo: input.deviceInfo,
    createdAt: now,
    lastSeenAt: now,
  };

  await sessionRepo.save(session, sessionTtlSeconds());
  pruneToCap(input.userId);
  logger.info('Session created', { sid, userId: input.userId, portal: input.portal });

  return { sid, token: `${sid}${TOKEN_SEPARATOR}${secret}` };
};

const sidFromToken = (token: string): string => token.split(TOKEN_SEPARATOR)[0];

// A token copied into another portal's cookie must not authenticate there.
const verifySessionToken = async (token: string, roleCode: string): Promise<VerifySessionResult> => {
  const parts = (token || '').split(TOKEN_SEPARATOR);
  if (parts.length !== TOKEN_PART_COUNT) return invalid(SESSION_INVALID_REASON.MALFORMED);

  const [sid, secret] = parts;
  if (!sid || !secret) return invalid(SESSION_INVALID_REASON.MALFORMED);

  const found = await sessionRepo.findBySid(sid);
  if (!found) return invalid(SESSION_INVALID_REASON.NOT_FOUND);

  const { session, ttlSeconds } = found;
  if (!digestsMatch(sha256Hex(secret), session.secretHash)) {
    logger.warn('Session secret mismatch', { sid, userId: session.userId });
    return invalid(SESSION_INVALID_REASON.SECRET_MISMATCH);
  }
  if (Date.now() > absoluteDeadline(session)) {
    dropExpired(sid, session.userId);
    return invalid(SESSION_INVALID_REASON.EXPIRED_ABSOLUTE);
  }
  if (portalOf(session.portal) !== portalOf(roleCode)) {
    logger.warn('Session presented on another portal', { sid, portal: session.portal, roleCode });
    return invalid(SESSION_INVALID_REASON.PORTAL_MISMATCH);
  }

  touchTtl(session, ttlSeconds);
  return { valid: true, session };
};

const revokeSession = async (
  sid: string,
  userId: string,
  reason: SessionRevokeReason = SESSION_REVOKE_REASON.MANUAL,
): Promise<void> => {
  await sessionRepo.deleteBySid(sid, userId);
  logger.info('Session revoked', { sid, userId, reason });
};

const revokeOwnSession = async (sid: string, userId: string): Promise<void> => {
  const found = await sessionRepo.findBySid(sid);
  if (!found || found.session.userId !== userId) {
    throw ApiError.notFound(AUTH_ERRORS.SESSION_NOT_FOUND.message, AUTH_ERRORS.SESSION_NOT_FOUND.code);
  }
  await revokeSession(sid, userId);
};

const revokeAllSessions = async (
  userId: string,
  reason: SessionRevokeReason = SESSION_REVOKE_REASON.LOGOUT_ALL,
): Promise<void> => {
  await sessionRepo.deleteAllForUser(userId);
  logger.info('All sessions revoked', { userId, reason });
};

const listUserSessions = async (
  userId: string,
  currentSid?: string,
): Promise<SessionDevice[]> => {
  const sids = await sessionRepo.listSidsByUser(userId);
  if (sids.length === 0) return [];

  const bounded = sids.slice(0, envConfig.SESSION.MAX_PER_USER);
  const records = await sessionRepo.findManyBySids(bounded);

  return records
    .filter((record): record is SessionRecord => record !== null)
    .map((record) => toDevice(record, currentSid));
};

const switchActiveRole = async (
  sid: string,
  newRole: string,
  availableRoles: string[],
): Promise<SessionRecord> => {
  if (!availableRoles.includes(newRole)) {
    throw ApiError.fromAuthError(AUTH_ERRORS.ROLE_SWITCH_DENIED);
  }

  const found = await sessionRepo.findBySid(sid);
  if (!found) throw ApiError.fromAuthError(AUTH_ERRORS.SESSION_NOT_FOUND);

  const { session } = found;
  const updated: SessionRecord = {
    ...session,
    activeRole: newRole,
    availableRoles,
    lastSeenAt: Date.now(),
  };

  await sessionRepo.saveFields(updated);
  logger.info('Session role switched', {
    sid,
    userId: session.userId,
    activeRole: newRole,
  });

  return updated;
};

// Display fields live in every one of a user's sessions, so a profile edit has to
// rewrite them all or the change is invisible until each device logs in again.
const syncUser = async (userId: string, user: SessionUser): Promise<void> => {
  const sids = await sessionRepo.listSidsByUser(userId);
  if (sids.length === 0) return;

  const records = await sessionRepo.findManyBySids(sids);
  await Promise.all(
    records
      .filter((record): record is SessionRecord => record !== null)
      .map((record) => sessionRepo.saveFields({ ...record, user })),
  );
};

const createResetSession = async (email: string): Promise<string> => {
  const resetId = (await randomBytesAsync(RESET_ID_BYTES)).toString('base64url');
  await setKey(resetSessionKey(resetId), email, RESET_TTL_SECONDS);
  return resetId;
};

const readResetSession = async (resetId: string): Promise<string | null> =>
  getKey(resetSessionKey(resetId));

const clearResetSession = async (resetId: string): Promise<void> => {
  await delKey(resetSessionKey(resetId));
};

const sessionService = {
  createSession,
  verifySessionToken,
  revokeSession,
  revokeOwnSession,
  revokeAllSessions,
  listUserSessions,
  switchActiveRole,
  syncUser,
};

export default sessionService;
export {
  toSessionUser,
  sidFromToken,
  cookieMaxAgeMs,
  createResetSession,
  readResetSession,
  clearResetSession,
};
