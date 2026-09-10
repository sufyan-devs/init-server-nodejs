import { randomInt } from 'node:crypto';
import { setKey, getKey, delKey, incrementKey, getTTL, identifierHash } from '@utils/redisKeys';
import { envConfig } from '@config/env';
import { logger } from '@utils/logger';

type OtpKeyPart = 'code' | 'attempts' | 'send_count';

const otpKey = (purpose: OtpPurpose, email: string, part: OtpKeyPart): string =>
  `otp:${purpose}:${identifierHash(email)}:${part}`;

interface OTPKeys {
  code: string;
  attempts: string;
  sendCount: string;
}

export interface RateLimitResult {
  allowed: boolean;
  waitSeconds: number | null;
}

export interface OTPVerifyResult {
  valid: boolean;
  attemptsExceeded: boolean;
  remainingAttempts: number | null;
  waitSeconds: number | null;
}

const otpKeys = (purpose: OtpPurpose, email: string): OTPKeys => ({
  code: otpKey(purpose, email, 'code'),
  attempts: otpKey(purpose, email, 'attempts'),
  sendCount: otpKey(purpose, email, 'send_count'),
});

export function generateOTP(): string {
  const length = envConfig.OTP.LENGTH;
  // randomInt, not Math.random: this code gates password reset, and V8's PRNG is
  // reconstructable from a few observed outputs. randomInt is also unbiased,
  // which `Math.floor(random * 10)` is not.
  let otp = "";
  for (let i = 0; i < length; i++) otp += String(randomInt(0, 10));
  return otp;
}

export const OTP_PURPOSE = {
  VERIFY_EMAIL: 'verify_email',
  PASSWORD_RESET: 'password_reset',
} as const;

export type OtpPurpose = (typeof OTP_PURPOSE)[keyof typeof OTP_PURPOSE];

export async function checkSendRateLimit(email: string, purpose: OtpPurpose): Promise<RateLimitResult> {
  const keys = otpKeys(purpose, email);
  const max = envConfig.OTP.SEND.MAX_REQUESTS;

  try {
    const count = parseInt((await getKey(keys.sendCount)) || "0", 10);
    if (count >= max) {
      const ttl = await getTTL(keys.sendCount);
      return { allowed: false, waitSeconds: ttl > 0 ? ttl : null };
    }
    return { allowed: true, waitSeconds: null };
  } catch (error: unknown) {
    // Fails closed, unlike the request limiter: allowing sends we cannot count means
    // unbounded outbound email, and every other auth path already fails closed when
    // Redis is unreachable.
    logger.error('Send rate-limit check failed', {
      purpose,
      email: identifierHash(email),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function storeOTP(email: string, otp: string, purpose: OtpPurpose): Promise<boolean> {
  try {
    const keys = otpKeys(purpose, email);
    const ttlSeconds = envConfig.OTP.EXPIRY_MINUTES * 60;
    const sendWindowSeconds = envConfig.OTP.SEND.WINDOW_MINUTES * 60;

    await setKey(keys.code, otp, ttlSeconds);
    await setKey(keys.attempts, "0", ttlSeconds);

    const exists = await getKey(keys.sendCount);
    if (!exists) {
      await setKey(keys.sendCount, "1", sendWindowSeconds);
    } else {
      await incrementKey(keys.sendCount);
    }

    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to store OTP', {
      purpose,
      email: identifierHash(email),
      error: message,
    });
    return false;
  }
}

export async function verifyOTP(email: string, otp: string, purpose: OtpPurpose): Promise<OTPVerifyResult> {
  const maxAttempts = envConfig.OTP.VERIFY.MAX_ATTEMPTS;

  try {
    const keys = otpKeys(purpose, email);

    const storedOTP = await getKey(keys.code);
    if (!storedOTP)
      return {
        valid: false,
        attemptsExceeded: false,
        remainingAttempts: null,
        waitSeconds: null,
      };

    const attempts = parseInt((await getKey(keys.attempts)) || "0", 10);
    if (attempts >= maxAttempts) {
      const ttl = await getTTL(keys.attempts);
      return {
        valid: false,
        attemptsExceeded: true,
        remainingAttempts: 0,
        waitSeconds: ttl > 0 ? ttl : null,
      };
    }

    if (storedOTP !== otp) {
      await incrementKey(keys.attempts);
      const newAttempts = attempts + 1;
      if (newAttempts >= maxAttempts) {
        const ttl = await getTTL(keys.attempts);
        return {
          valid: false,
          attemptsExceeded: true,
          remainingAttempts: 0,
          waitSeconds: ttl > 0 ? ttl : null,
        };
      }
      return {
        valid: false,
        attemptsExceeded: false,
        remainingAttempts: maxAttempts - newAttempts,
        waitSeconds: null,
      };
    }

    return {
      valid: true,
      attemptsExceeded: false,
      remainingAttempts: null,
      waitSeconds: null,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('OTP verification failed', {
      purpose,
      email: identifierHash(email),
      error: message,
    });
    return {
      valid: false,
      attemptsExceeded: false,
      remainingAttempts: null,
      waitSeconds: null,
    };
  }
}

export async function clearOTPKeys(email: string, purpose: OtpPurpose): Promise<void> {
  const keys = otpKeys(purpose, email);
  try {
    await Promise.all([delKey(keys.code), delKey(keys.attempts)]);
  } catch (error: unknown) {
    logger.warn('OTP key cleanup failed', {
      purpose,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
