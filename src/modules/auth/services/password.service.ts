import axios from 'axios';
import * as argon2 from 'argon2';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import User, { USER_STATUS } from '@user/models/User';
import type { IUser } from '@user/models/User';
import lockout from '@auth/services/lockout.service';
import ApiError from '@utils/apiError';
import AuthErrors from '@constants/authErrors';
import { envConfig } from '@config/env';
import { logger } from '@utils/logger';
import { record, AUDIT_ACTION, AUDIT_OUTCOME } from '@audit/index';

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: envConfig.PASSWORD.ARGON2.MEMORY_KIB,
  timeCost: envConfig.PASSWORD.ARGON2.TIME_COST,
  parallelism: envConfig.PASSWORD.ARGON2.PARALLELISM,
} as const;

const HIBP_URL = 'https://api.pwnedpasswords.com/range';
const HIBP_TIMEOUT_MS = 2000;

let dummyHash: Promise<string> | undefined;

const dummyVerify = async (password: string): Promise<boolean> => {
  dummyHash ??= hashPassword(randomBytes(32).toString('hex')).catch((error: unknown) => {
    dummyHash = undefined;
    throw error;
  });
  return argon2.verify(await dummyHash, password);
};

const verifyHash = async (hash: string, password: string): Promise<boolean> => {
  try {
    if (hash.startsWith('$2')) return await bcrypt.compare(password, hash);
    return await argon2.verify(hash, password);
  } catch {
    logger.warn('Stored password hash is not verifiable', { prefix: hash.slice(0, 8) });
    return false;
  }
};

const needsUpgrade = (hash: string): boolean =>
  hash.startsWith('$2') || argon2.needsRehash(hash, ARGON2_OPTIONS);

// The only path from a plaintext password to a stored value; never assign plaintext.
const hashPassword = (plain: string): Promise<string> => argon2.hash(plain, ARGON2_OPTIONS);

const upgradeHash = (userId: string, password: string): void => {
  void hashPassword(password)
    .then((passwordHash) => User.updateOne({ _id: userId }, { $set: { passwordHash } }))
    .catch((error: unknown) => {
      logger.warn('Password hash upgrade failed', {
        userId,
        reason: error instanceof Error ? error.message : String(error),
      });
    });
};

const invalidCredentials = (email: string, reason: string, actorId?: string): ApiError => {
  logger.warn('Login rejected', { email, reason });
  void record({
    actorId,
    action: AUDIT_ACTION.LOGIN_FAILURE,
    outcome: AUDIT_OUTCOME.FAILURE,
    meta: { email, reason },
  });
  return ApiError.fromAuthError(401, AuthErrors.INVALID_CREDENTIALS);
};

const verifyPassword = async (email: string, password: string): Promise<IUser> => {
  const user = await User.findByEmail(email);

  // Hashed before every guard, so all failure paths cost the same — no timing oracle.
  const passwordMatches = user?.passwordHash
    ? await verifyHash(user.passwordHash, password)
    : await dummyVerify(password);

  if (!user) throw invalidCredentials(email, 'no such account');
  if (!user.passwordHash) throw invalidCredentials(email, 'no password credential', String(user._id));
  if (user.status !== USER_STATUS.ACTIVE) {
    throw invalidCredentials(email, `status ${user.status}`, String(user._id));
  }

  const userId = String(user._id);
  try {
    await lockout.assertNotLocked(userId);
  } catch (error: unknown) {
    if (!(error instanceof ApiError)) throw error;
    throw invalidCredentials(email, 'locked out', userId);
  }

  if (!passwordMatches) {
    await lockout.recordFailure(userId);
    throw invalidCredentials(email, 'wrong password', userId);
  }

  await lockout.clearFailures(userId);
  if (needsUpgrade(user.passwordHash)) upgradeHash(userId, password);
  return user;
};

const isBreached = async (password: string): Promise<boolean> => {
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
  const { data } = await axios.get<string>(`${HIBP_URL}/${sha1.slice(0, 5)}`, {
    timeout: HIBP_TIMEOUT_MS,
    responseType: 'text',
  });

  const suffix = sha1.slice(5);
  return data.split('\n').some((line) => line.startsWith(suffix));
};

const assertPasswordAllowed = async (password: string): Promise<void> => {
  const { MIN_LENGTH, HIBP_CHECK } = envConfig.PASSWORD;

  if (password.length < MIN_LENGTH) {
    throw new ApiError(400, `Password must be at least ${MIN_LENGTH} characters.`, {
      code: AuthErrors.PASSWORD_TOO_WEAK.code,
    });
  }
  if (!HIBP_CHECK) return;

  let breached: boolean;
  try {
    breached = await isBreached(password);
  } catch (error: unknown) {
    // Fail open: a third-party outage must not stop people signing up.
    logger.warn('Breached-password check skipped', {
      reason: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  if (breached) {
    throw new ApiError(
      400,
      'This password has appeared in a data breach. Please choose a different one.',
      { code: AuthErrors.PASSWORD_TOO_WEAK.code },
    );
  }
};

export { verifyPassword, assertPasswordAllowed, dummyVerify, hashPassword };

export default { verifyPassword, assertPasswordAllowed };
