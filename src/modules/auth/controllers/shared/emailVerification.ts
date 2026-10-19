import sessionService, { toSessionUser } from '@auth/services/session.service';
import { generateOTP, checkSendRateLimit, storeOTP, verifyOTP, clearOTPKeys, OTP_PURPOSE, OTP_RESULT } from '@auth/helpers/otp';
import { sendEmail, templates } from '@notification/email';
import AuthErrors from '@constants/authErrors';
import User, { USER_STATUS } from '@user/models/User';
import catchAsync from '@utils/catchAsync';
import response from '@utils/response';
import { formatWaitTime } from '@utils/format';
import { logger } from '@utils/logger';

const PURPOSE = OTP_PURPOSE.VERIFY_EMAIL;

export const verifyEmailOTP = catchAsync(async (req, res) => {
  const { email, otp } = req.body;

  const user = await User.findOne({ email, status: USER_STATUS.ACTIVE });

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

  await clearOTPKeys(email, PURPOSE);
  if (user && !user.emailVerified) {
    user.emailVerified = true;
    await user.save();
    await sessionService.syncUser(String(user._id), toSessionUser(user));
  }

  return response.success(res, null, 200, "Email verified successfully.");
});

export const sendEmailOTP = catchAsync(async (req, res) => {
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

  const otp = generateOTP();
  await storeOTP(email, otp, PURPOSE);

  if (user && !user.emailVerified) {
    const tpl = templates.emailVerificationOtp({
      firstName: user.fullName,
      otpCode: otp,
    });
    sendEmail({ to: email, subject: tpl.subject, html: tpl.html, type: "email_verification" });
  } else {
    logger.warn("Verification code requested for an unknown or already-verified address", {
      email,
    });
  }

  return response.success(
    res,
    null,
    200,
    "If that address needs verification, we've sent a code.",
  );
});
