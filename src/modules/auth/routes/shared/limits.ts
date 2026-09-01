import { rateLimit } from '@middlewares/rateLimit';
import { envConfig } from '@config/env';

export const loginRateLimit = rateLimit({
  bucket: 'login',
  rule: envConfig.RATE_LIMIT.LOGIN,
  by: 'ip',
});

export const registerRateLimit = rateLimit({
  bucket: 'register',
  rule: envConfig.RATE_LIMIT.REGISTER,
  by: 'ip',
});

export const otpRateLimit = rateLimit({
  bucket: 'otp',
  rule: envConfig.RATE_LIMIT.OTP,
  by: 'both',
});

// A separate bucket from sending: guessing codes must not consume the allowance
// for requesting one, or a failed guess would block the retry that fixes it.
export const otpVerifyRateLimit = rateLimit({
  bucket: 'otp-verify',
  rule: envConfig.RATE_LIMIT.OTP,
  by: 'both',
});
