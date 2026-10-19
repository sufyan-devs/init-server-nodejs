import { generateOTP, checkSendRateLimit, storeOTP, verifyOTP, clearOTPKeys, OTP_PURPOSE, OTP_RESULT } from '@auth/helpers/otp';
import { sendEmail, templates } from '@notification/email';
import AuthErrors from '@constants/authErrors';
import User, { USER_STATUS } from '@user/models/User';
import { setResetCookie, clearResetCookie, getResetToken } from '@utils/cookieHelper';
import * as authHelper from './authHelper';
import {
  createResetSession,
  readResetSession,
  clearResetSession,
} from '@auth/services/session.service';
import { assertPasswordAllowed, hashPassword } from '@auth/services/password.service';
import lockout from '@auth/services/lockout.service';
import catchAsync from '@utils/catchAsync';
import response from '@utils/response';
import ApiError from '@utils/apiError';
import { formatWaitTime, errorMessage } from '@utils/format';
import { logger } from '@utils/logger';

const PURPOSE = OTP_PURPOSE.PASSWORD_RESET;

export const forgotPassword = catchAsync(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email, status: USER_STATUS.ACTIVE });

  const rateLimit = await checkSendRateLimit(email, PURPOSE);
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
  await storeOTP(email, resetOTP, PURPOSE);

  if (user) {
    const tpl = templates.passwordResetOtp({
      firstName: user.fullName,
      otpCode: resetOTP,
    });
    sendEmail({
      to: email,
      subject: tpl.subject,
      html: tpl.html,
      type: "password_reset",
    });
  } else {
    logger.warn("Password reset requested for an unknown address", { email });
  }

  clearResetCookie(res);

  return response.success(
    res,
    null,
    200,
    "If that address is registered, we've sent a reset code.",
  );
});

export const verifyResetOTP = catchAsync(async (req, res) => {
  const { email, otp } = req.body;

  const result = await verifyOTP(email, otp, PURPOSE);
  if (result.status === OTP_RESULT.LOCKED) {
    return response.error(res, {
      code: AuthErrors.OTP_MAX_ATTEMPTS.code,
      message: `Too many incorrect attempts. Please wait ${formatWaitTime(result.waitSeconds)} before trying again.`,
    }, 429, { waitSeconds: result.waitSeconds });
  }
  if (result.status === OTP_RESULT.WRONG) {
    return response.error(res, {
      code: AuthErrors.INVALID_OTP.code,
      message: `Invalid verification code. ${result.remainingAttempts} attempt(s) remaining.`,
    }, 400, { remainingAttempts: result.remainingAttempts });
  }
  if (result.status === OTP_RESULT.EXPIRED) {
    return response.error(res, {
      code: AuthErrors.INVALID_OTP.code,
      message: "This code has expired. Please request a new one.",
    }, 400);
  }

  // Burned before the reset session exists: if the delete fails, no session was minted
  // from a code that is still valid.
  await clearOTPKeys(email, PURPOSE);

  let resetId: string;
  try {
    resetId = await createResetSession(email);
  } catch (err: unknown) {
    logger.error("passwordReset.verifyResetOTP failed to create redis session", {
      error: errorMessage(err),
    });
    throw ApiError.internal("Session creation failed. Please try again.");
  }
  setResetCookie(res, resetId);

  return response.success(res, null, 200, "OTP verified. Proceed to reset password.");
});

export const resetPassword = catchAsync(async (req, res) => {
  const { email, newPassword } = req.body;

  const resetSessionId = getResetToken(req);
  if (!resetSessionId) {
    return response.error(res, AuthErrors.INVALID_RESET_SESSION, 401);
  }

  const storedEmail = await readResetSession(resetSessionId);
  if (!storedEmail || storedEmail !== email) {
    return response.error(res, AuthErrors.INVALID_RESET_SESSION, 401);
  }

  await assertPasswordAllowed(newPassword);

  await clearResetSession(resetSessionId);
  clearResetCookie(res);

  const user = await User.findOne({ email, status: USER_STATUS.ACTIVE });
  if (!user) {
    return response.notFound(res, AuthErrors.USER_NOT_FOUND);
  }

  user.passwordHash = await hashPassword(newPassword);
  await user.save();

  await lockout.clearFailures(String(user._id));
  await authHelper.logoutAllSessions(user._id);

  return response.success(res, null, 200, "Password reset successfully!");
});
