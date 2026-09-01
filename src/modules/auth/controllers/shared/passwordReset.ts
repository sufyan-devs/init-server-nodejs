import { randomBytes } from 'node:crypto';
import { setKey, getKey, delKey } from '@utils/redisKeys';
import { generateOTP, checkSendRateLimit, storeOTP, verifyOTP, clearOTPKeys } from '@utils/otp';
import { sendEmail, templates } from '@notification/email';
import AuthErrors from '@constants/authErrors';
import { envConfig } from '@config/env';
import User, { USER_STATUS } from '@user/models/User';
import {
  setSessionCookie,
  clearSessionCookie,
  getResetToken,
} from '@utils/cookieHelper';
import * as authHelper from './authHelper';
import { assertPasswordAllowed, hashPassword } from '@auth/services/password.service';
import lockout from '@auth/services/lockout.service';
import catchAsync from '@utils/catchAsync';
import response from '@utils/response';
import ApiError from '@utils/apiError';
import { normalizeEmail, formatWaitTime } from '@utils/format';
import { logger } from '@utils/logger';

const PURPOSE = "password_reset";
const RESET_TTL_SECONDS = envConfig.PASSWORD_RESET.SESSION_EXPIRY_MINUTES * 60;

export const forgotPassword = catchAsync(async (req, res) => {
  const { email } = req.body;
  const normalized = normalizeEmail(email);

  if (!normalized) {
    return response.error(res, "Email is required", 400);
  }

  const user = await User.findOne({ email: normalized, status: USER_STATUS.ACTIVE });

  const rateLimit = await checkSendRateLimit(normalized, PURPOSE);
  if (!rateLimit.allowed) {
    const wait = rateLimit.waitSeconds;
    return response.error(
      res,
      {
        code: AuthErrors.RATE_LIMIT_EXCEEDED.code,
        message: `Too many OTP requests. Please wait ${formatWaitTime(wait)} before requesting again.`,
      },
      429,
      { waitSeconds: wait },
    );
  }

  const resetOTP = generateOTP();
  // Stored even for an unknown address: otherwise the attempt count differs and leaks existence.
  const stored = await storeOTP(normalized, resetOTP, PURPOSE);
  if (!stored) {
    throw ApiError.internal("Failed to process request. Please try again.");
  }

  if (user) {
    const tpl = templates.passwordResetOtp({
      firstName: `${user.firstName} ${user.lastName}`.trim(),
      otpCode: resetOTP,
    });
    sendEmail({
      to: normalized,
      subject: tpl.subject,
      html: tpl.html,
      type: "password_reset",
    });
  } else {
    logger.warn("Password reset requested for an unknown address", { email: normalized });
  }

  clearSessionCookie(res, 'RESET');

  return response.success(
    res,
    null,
    200,
    "If that address is registered, we've sent a reset code.",
  );
});

export const verifyResetOTP = catchAsync(async (req, res) => {
  const { email, otp } = req.body;
  const normalized = normalizeEmail(email);
  const code = String(otp ?? '').trim();

  if (!normalized || !code) {
    return response.error(
      res,
      "Email and verification code are required.",
      400,
    );
  }

  const result = await verifyOTP(normalized, code, PURPOSE);
  if (!result.valid) {
    if (result.attemptsExceeded) {
      const wait = result.waitSeconds;
      return response.error(res, {
        code: AuthErrors.OTP_MAX_ATTEMPTS.code,
        message: `Too many incorrect attempts. Please wait ${formatWaitTime(wait)} before trying again.`,
      }, 429, { waitSeconds: wait });
    }
    return response.error(res, {
      code: AuthErrors.INVALID_OTP.code,
      message: `Invalid verification code. ${result.remainingAttempts} attempt(s) remaining.`,
    }, 400, { remainingAttempts: result.remainingAttempts });
  }

  let resetId: string;
  try {
    resetId = randomBytes(32).toString('base64url');
    await setKey(`reset_session:${resetId}`, normalized, RESET_TTL_SECONDS);
    setSessionCookie(res, resetId, 'RESET');
  } catch (err: unknown) {
    logger.error("passwordReset.verifyResetOTP failed to create redis session", {
      error: (err as Error).message || err,
    });
    throw ApiError.internal("Session creation failed. Please try again.");
  }

  await clearOTPKeys(normalized, PURPOSE);

  return response.success(res, null, 200, "OTP verified. Proceed to reset password.");
});

export const resetPassword = catchAsync(async (req, res) => {
  const { email, newPassword } = req.body;
  const normalized = normalizeEmail(email);

  if (!normalized) {
    return response.error(res, "Email is required", 400);
  }
  if (!newPassword || !newPassword.trim()) {
    return response.error(res, "New password is required", 400);
  }

  const resetSessionId = getResetToken(req);
  if (!resetSessionId) {
    return response.error(res, AuthErrors.INVALID_RESET_SESSION, 401);
  }

  const storedEmail = await getKey(`reset_session:${resetSessionId}`);
  if (!storedEmail || storedEmail !== normalized) {
    return response.error(res, AuthErrors.INVALID_RESET_SESSION, 401);
  }

  await assertPasswordAllowed(newPassword);

  await delKey(`reset_session:${resetSessionId}`);
  clearSessionCookie(res, 'RESET');

  const user = await User.findOne({ email: normalized, status: USER_STATUS.ACTIVE });
  if (!user) {
    return response.notFound(res, AuthErrors.USER_NOT_FOUND);
  }

  user.passwordHash = await hashPassword(newPassword);
  await user.save();

  await lockout.clearFailures(String(user._id));
  await authHelper.logoutAllSessions(user._id);

  return response.success(res, null, 200, "Password reset successfully!");
});
