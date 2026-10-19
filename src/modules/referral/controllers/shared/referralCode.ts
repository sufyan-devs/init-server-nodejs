import ReferralCode from '@referral/models/ReferralCode';
import catchAsync from '@utils/catchAsync';
import ApiError from '@utils/apiError';
import response from '@utils/response';

const getReferralCode = catchAsync(async (req, res) => {
  const referralCode = await ReferralCode.findByUserId(req.user!._id);
  if (!referralCode)
    throw ApiError.notFound("No referral code found for your account.", 'REFERRAL_CODE_NOT_FOUND');
  return response.success(res, {
    code: referralCode.code,
    totalUsed: referralCode.totalUsed,
    successfulReferrals: referralCode.successfulReferrals,
    createdAt: referralCode.createdAt,
  });
});

export { getReferralCode };
