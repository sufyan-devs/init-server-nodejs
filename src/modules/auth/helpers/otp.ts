import { randomInt } from 'node:crypto';
import { setKey, getKey, delKey, incrementKey, incrementWithTTL, getTTL, identifierHash } from '@utils/redisKeys';
import { envConfig } from '@config/env';
import { logger } from '@utils/logger';
import { errorMessage } from '@utils/format';

type OtpKeyPart = 'code' | 'attempts' | 'send_count';

const otpKey = (purpose: OtpPurpose, email: string, part: OtpKeyPart): string =>
  `otp:${purpose}:${identifierHash(email)}:${part}`;

interface OTPKeys {
  code: string;
  attempts: string;
  sendCount: string;
}

interface RateLimitResult {
  allowed: boolean;
  waitSeconds: number | null;
}

export const OTP_RESULT = {
  VALID: 'valid',
  EXPIRED: 'expired',
  WRONG: 'wrong',
  LOCKED: 'locked',
} as const;

type OTPVerifyResult =
  | { status: typeof OTP_RESULT.VALID | typeof OTP_RESULT.EXPIRED }
  | { status: typeof OTP_RESULT.WRONG; remainingAttempts: number }
  | { status: typeof OTP_RESULT.LOCKED; waitSeconds: number | null };

const otpKeys = (purpose: OtpPurpose, email: string): OTPKeys => ({
  code: otpKey(purpose, email, 'code'),
  attempts: otpKey(purpose, email, 'attempts'),
  sendCount: otpKey(purpose, email, 'send_count'),
});

export function generateOTP(): string {
  const length = envConfig.OTP.LENGTH;
  // randomInt, not Math.random: this gates password reset, and V8's PRNG is
  // reconstructable from a few observed outputs.
  let otp = "";
  for (let i = 0; i < length; i++) otp += String(randomInt(0, 10));
  return otp;
}

export const OTP_PURPOSE = {
  VERIFY_EMAIL: 'verify_email',
  PASSWORD_RESET: 'password_reset',
} as const;

type OtpPurpose = (typeof OTP_PURPOSE)[keyof typeof OTP_PURPOSE];

const waitFrom = (ttl: number): number | null => (ttl > 0 ? ttl : null);

export async function checkSendRateLimit(email: string, purpose: OtpPurpose): Promise<RateLimitResult> {
  const keys = otpKeys(purpose, email);
  const max = envConfig.OTP.SEND.MAX_REQUESTS;

  try {
    const count = parseInt((await getKey(keys.sendCount)) || "0", 10);
    if (count >= max) {
      return { allowed: false, waitSeconds: waitFrom(await getTTL(keys.sendCount)) };
    }
    return { allowed: true, waitSeconds: null };
  } catch (error: unknown) {
    // Fails closed, unlike the request limiter: allowing sends we cannot count means
    // unbounded outbound email, and every other auth path already fails closed when
    // Redis is unreachable.
    logger.error('Send rate-limit check failed', {
      purpose,
      email: identifierHash(email),
      error: errorMessage(error),
    });
    throw error;
  }
}

export async function storeOTP(email: string, otp: string, purpose: OtpPurpose): Promise<void> {
  const keys = otpKeys(purpose, email);
  const ttlSeconds = envConfig.OTP.EXPIRY_MINUTES * 60;

  await setKey(keys.code, otp, ttlSeconds);
  await setKey(keys.attempts, "0", ttlSeconds);
  await incrementWithTTL([keys.sendCount], envConfig.OTP.SEND.WINDOW_MINUTES * 60);
}

export async function verifyOTP(email: string, otp: string, purpose: OtpPurpose): Promise<OTPVerifyResult> {
  const maxAttempts = envConfig.OTP.VERIFY.MAX_ATTEMPTS;
  const keys = otpKeys(purpose, email);

  const storedOTP = await getKey(keys.code);
  if (!storedOTP) return { status: OTP_RESULT.EXPIRED };

  // Counted before comparing, from INCR's own reply: parallel guesses that read the
  // count first would all see the same value and overrun the cap together.
  const attempts = await incrementKey(keys.attempts);
  if (attempts > maxAttempts) {
    return { status: OTP_RESULT.LOCKED, waitSeconds: waitFrom(await getTTL(keys.attempts)) };
  }
  if (storedOTP === otp) return { status: OTP_RESULT.VALID };
  if (attempts === maxAttempts) {
    return { status: OTP_RESULT.LOCKED, waitSeconds: waitFrom(await getTTL(keys.attempts)) };
  }
  return { status: OTP_RESULT.WRONG, remainingAttempts: maxAttempts - attempts };
}

export async function clearOTPKeys(email: string, purpose: OtpPurpose): Promise<void> {
  const keys = otpKeys(purpose, email);
  await Promise.all([delKey(keys.code), delKey(keys.attempts)]);
}
