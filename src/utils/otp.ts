import { randomInt } from 'node:crypto';
import { setKey, getKey, delKey, incrementKey, getTTL } from '@utils/redisKeys';
import { envConfig } from '@config/env';
import { logger } from '@utils/logger';

export interface OTPKeys {
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
//   password_reset:{email}:attempts
//   password_reset:{email}:send_count
const otpKeys = (purpose: string, email: string): OTPKeys => ({
  code: `${purpose}:${email}:code`,
  attempts: `${purpose}:${email}:attempts`,
  sendCount: `${purpose}:${email}:send_count`,
});

export function generateOTP(length: number = envConfig.OTP.LENGTH): string {
  // randomInt, not Math.random: this code gates password reset, and V8's PRNG is
  // reconstructable from a few observed outputs. randomInt is also unbiased,
  // which `Math.floor(random * 10)` is not.
  let otp = "";
  for (let i = 0; i < length; i++) otp += String(randomInt(0, 10));
  return otp;
}

export async function checkSendRateLimit(email: string, purpose: string): Promise<RateLimitResult> {
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
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Send rate-limit check failed for ${email}`, {
      error: message,
    });
    return { allowed: true, waitSeconds: null };
  }
}

export async function storeOTP(email: string, otp: string, purpose: string): Promise<boolean> {
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
    logger.error(`Failed to store OTP for ${email}`, {
      error: message,
    });
    return false;
  }
}

export async function verifyOTP(email: string, otp: string, purpose: string): Promise<OTPVerifyResult> {
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
    logger.error(`OTP verification failed for ${email}`, {
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

export async function clearOTPKeys(email: string, purpose: string): Promise<void> {
  const keys = otpKeys(purpose, email);
  try {
    await delKey(keys.code, keys.attempts);
  } catch {
    // silently ignore cleanup errors
  }
}
