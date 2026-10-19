import {
  delKey,
  getKey,
  incrementWithTTL,
  loginFailKey,
  loginLockKey,
  setKey,
} from '@utils/redisKeys';
import { envConfig } from '@config/env';
import AUTH_ERRORS from '@constants/authErrors';
import ApiError from '@utils/apiError';
import { logger } from '@utils/logger';
import { record, AUDIT_ACTION, AUDIT_OUTCOME } from '@audit/index';
import { errorMessage } from '@utils/format';

const LOCK_MARKER = '1';

const isLocked = async (userId: string): Promise<boolean> =>
  (await getKey(loginLockKey(userId))) !== null;

const assertNotLocked = async (userId: string): Promise<void> => {
  if (await isLocked(userId)) {
    throw ApiError.fromAuthError(AUTH_ERRORS.ACCOUNT_LOCKED);
  }
};

const recordFailure = async (userId: string): Promise<void> => {
  try {
    const [hit] = await incrementWithTTL(
      [loginFailKey(userId)],
      envConfig.LOCKOUT.WINDOW_SECONDS,
    );
    if (!hit || hit.count < envConfig.LOCKOUT.MAX_ATTEMPTS) return;

    await setKey(loginLockKey(userId), LOCK_MARKER, envConfig.LOCKOUT.DURATION_SECONDS);
    await delKey(loginFailKey(userId));
    logger.warn('Account locked after repeated failures', { userId, attempts: hit.count });
    void record({
      actorId: userId,
      action: AUDIT_ACTION.ACCOUNT_LOCKED,
      outcome: AUDIT_OUTCOME.FAILURE,
      meta: { attempts: hit.count },
    });
  } catch (error: unknown) {
    logger.error('Lockout tracking failed — failure not counted', {
      userId,
      error: errorMessage(error),
    });
  }
};

const clearFailures = async (userId: string): Promise<void> => {
  await Promise.all([delKey(loginFailKey(userId)), delKey(loginLockKey(userId))]);
};

export default { assertNotLocked, recordFailure, clearFailures };
