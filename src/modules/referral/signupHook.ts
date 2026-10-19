import ApiError from '@utils/apiError';
import type { AuthError } from '@constants/authErrors';
import type { SignupHook, RoleApprovedHook } from '@auth/index';
import { ROLE_CODE } from '@user/models/Role';
import ReferralCode from '@referral/models/ReferralCode';
import Referral, { REFERRAL_STATUS } from '@referral/models/Referral';

const INVALID_REFERRAL_CODE: AuthError = {
  code: "AUTH_INVALID_REFERRAL_CODE",
  message: "Invalid referral code.",
  status: 400,
};

const ROLES_WITH_REFERRAL_CODE: readonly string[] = [ROLE_CODE.BUSINESS_ASSOCIATE, ROLE_CODE.VENDOR];

const referralSignupHook: SignupHook = async ({ roleCode, referralCode }) => {
  const referralCodeRecord = referralCode ? await ReferralCode.findByCode(referralCode) : null;
  if (referralCode && !referralCodeRecord)
    throw ApiError.fromAuthError(INVALID_REFERRAL_CODE);

  return async ({ userId }) => {
    if (!referralCodeRecord) return;
    await Referral.create({
      referrerId: referralCodeRecord.userId,
      referredUserId: userId,
      referralCodeId: referralCodeRecord._id,
      codeUsed: referralCodeRecord.code,
      roleAppliedFor: roleCode,
      status: REFERRAL_STATUS.PENDING,
      activatedAt: null,
    });
    await referralCodeRecord.incrementUsage(false);
  };
};

const referralRoleApprovedHook: RoleApprovedHook = async ({ userId, roleCode }) => {
  const referral = await Referral.findOne({
    referredUserId: userId,
    roleAppliedFor: roleCode,
    status: REFERRAL_STATUS.PENDING,
  });
  if (referral) {
    referral.status = REFERRAL_STATUS.ACTIVE;
    referral.activatedAt = new Date();
    await referral.save();
    await ReferralCode.updateOne({ _id: referral.referralCodeId }, { $inc: { successfulReferrals: 1 } });
  }

  if (ROLES_WITH_REFERRAL_CODE.includes(roleCode) && !(await ReferralCode.findByUserId(userId))) {
    await ReferralCode.createForUser(userId);
  }
};

export { referralSignupHook, referralRoleApprovedHook };
