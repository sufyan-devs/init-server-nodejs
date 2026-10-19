import ApiError from '@utils/apiError';
import type { AuthError } from '@constants/authErrors';
import type { SignupHook } from '@auth/index';
import { ROLE_CODE } from '@user/models/Role';
import ReferralCode from '@referral/models/ReferralCode';
import Referral, { REFERRAL_STATUS } from '@referral/models/Referral';

const INVALID_REFERRAL_CODE: AuthError = {
  code: "AUTH_INVALID_REFERRAL_CODE",
  message: "Invalid referral code.",
  status: 400,
};

const referralSignupHook: SignupHook = async ({ roleCode, referralCode }) => {
  const referralCodeRecord = referralCode ? await ReferralCode.findByCode(referralCode) : null;
  if (referralCode && !referralCodeRecord)
    throw ApiError.fromAuthError(INVALID_REFERRAL_CODE);

  return async ({ userId, autoApproved }) => {
    if (referralCodeRecord) {
      await Referral.create({
        referrerId: referralCodeRecord.userId,
        referredUserId: userId,
        referralCodeId: referralCodeRecord._id,
        codeUsed: referralCodeRecord.code,
        roleAppliedFor: roleCode,
        status: autoApproved ? REFERRAL_STATUS.ACTIVE : REFERRAL_STATUS.PENDING,
        activatedAt: autoApproved ? new Date() : null,
      });
      await referralCodeRecord.incrementUsage(autoApproved);
    }

    if ((roleCode === ROLE_CODE.BUSINESS_ASSOCIATE || roleCode === ROLE_CODE.VENDOR) && autoApproved) {
      await ReferralCode.createForUser(userId);
    }
  };
};

export { referralSignupHook };
