import ApiError from '@utils/apiError';
import sessionService, { toSessionUser } from '@auth/services/session.service';
import { generateOTP, checkSendRateLimit, storeOTP, verifyOTP, clearOTPKeys } from '@utils/otp';
import { sendEmail, templates } from '@notification/email';
import AuthErrors from '@constants/authErrors';
import User, { USER_STATUS } from '@user/models/User';
import catchAsync from '@utils/catchAsync';
import response from '@utils/response';
import { normalizeEmail, formatWaitTime } from '@utils/format';
import { logger } from '@utils/logger';

const PURPOSE = "verify_email";

export const verifyEmailOTP = catchAsync(async (req, res) => {
  const { email, otp } = req.body;
  const normalized = normalizeEmail(email);
  const code = String(otp ?? '').trim();

  if (!normalized || !code) {
    return response.error(res, "Email and verification code are required.", 400);
  }

  const user = await User.findOne({ email: normalized, status: USER_STATUS.ACTIVE });

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

  if (user && !user.emailVerified) {
    user.emailVerified = true;
    await user.save();
    await sessionService.syncUser(String(user._id), toSessionUser(user));
  }
  await clearOTPKeys(normalized, PURPOSE);

  return response.success(res, null, 200, "Email verified successfully.");
});

export const sendEmailOTP = catchAsync(async (req, res) => {
  const { email } = req.body;
  const normalized = normalizeEmail(email);

  if (!normalized) {
    return response.error(res, "Email is required.", 400);
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

  const otp = generateOTP();
  const stored = await storeOTP(normalized, otp, PURPOSE);
  if (!stored) {
    throw ApiError.internal("Failed to process request. Please try again.");
  }

  if (user && !user.emailVerified) {
    const tpl = templates.emailVerificationOtp({
      firstName: `${user.firstName} ${user.lastName}`.trim(),
      otpCode: otp,
    });
    sendEmail({ to: normalized, subject: tpl.subject, html: tpl.html, type: "email_verification" });
  } else {
    logger.warn("Verification code requested for an unknown or already-verified address", {
      email: normalized,
    });
  }

  return response.success(
    res,
    null,
    200,
    "If that address needs verification, we've sent a code.",
  );
});
