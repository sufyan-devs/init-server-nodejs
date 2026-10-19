import sessionService, { toSessionUser } from '@auth/services/session.service';
import { generateOtp, checkSendRateLimit, storeOtp, verifyOtp, clearOtpKeys, OTP_PURPOSE, OTP_RESULT } from '@auth/helpers/otp';
import { sendEmail, templates } from '@notification/index';
import AUTH_ERRORS from '@constants/authErrors';
import User, { USER_STATUS } from '@user/models/User';
import catchAsync from '@utils/catchAsync';
import response from '@utils/response';
import { formatWaitTime } from '@utils/format';
import { identifierHash } from '@utils/redisKeys';
import { logger } from '@utils/logger';

const PURPOSE = OTP_PURPOSE.VERIFY_EMAIL;

export const verifyEmailOtp = catchAsync(async (req, res) => {
  const { email, otp } = req.body;

  const user = await User.findOne({ email, status: USER_STATUS.ACTIVE });

  const result = await verifyOtp(email, otp, PURPOSE);
  if (result.status === OTP_RESULT.LOCKED) {
    return response.error(res, {
      code: AUTH_ERRORS.OTP_MAX_ATTEMPTS.code,
      message: `Too many incorrect attempts. Please wait ${formatWaitTime(result.waitSeconds)} before trying again.`,
    }, AUTH_ERRORS.OTP_MAX_ATTEMPTS.status, { waitSeconds: result.waitSeconds });
  }
  if (result.status === OTP_RESULT.WRONG) {
    return response.error(res, {
      code: AUTH_ERRORS.INVALID_OTP.code,
      message: `Invalid verification code. ${result.remainingAttempts} attempt(s) remaining.`,
    }, AUTH_ERRORS.INVALID_OTP.status, { remainingAttempts: result.remainingAttempts });
  }
  if (result.status === OTP_RESULT.EXPIRED) {
    return response.error(res, {
      code: AUTH_ERRORS.INVALID_OTP.code,
      message: "This code has expired. Please request a new one.",
    }, AUTH_ERRORS.INVALID_OTP.status);
  }

  await clearOtpKeys(email, PURPOSE);
  if (user && !user.emailVerified) {
    user.emailVerified = true;
    await user.save();
    await sessionService.syncUser(String(user._id), toSessionUser(user));
  }

  return response.success(res, null, 200, "Email verified successfully.");
});

export const sendEmailOtp = catchAsync(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email, status: USER_STATUS.ACTIVE });

  const rateLimit = await checkSendRateLimit(email, PURPOSE);
  if (!rateLimit.allowed) {
    const wait = rateLimit.waitSeconds;
    return response.error(
      res,
      {
        code: AUTH_ERRORS.RATE_LIMIT_EXCEEDED.code,
        message: `Too many OTP requests. Please wait ${formatWaitTime(wait)} before requesting again.`,
      },
      AUTH_ERRORS.RATE_LIMIT_EXCEEDED.status,
      { waitSeconds: wait },
    );
  }

  const otp = generateOtp();
  await storeOtp(email, otp, PURPOSE);

  if (user && !user.emailVerified) {
    const tpl = templates.emailVerificationOtp({
      firstName: user.fullName,
      otpCode: otp,
    });
    sendEmail({ to: email, subject: tpl.subject, html: tpl.html, type: "email_verification" });
  } else {
    logger.warn("Verification code requested for an unknown or already-verified address", {
      email: identifierHash(email),
    });
  }

  return response.success(
    res,
    null,
    200,
    "If that address needs verification, we've sent a code.",
  );
});
