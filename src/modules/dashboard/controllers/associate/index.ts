import Referral, { REFERRAL_STATUS } from '@referral/models/Referral';
import catchAsync from '@utils/catchAsync';
import response from '@utils/response';
import { toObjectId } from '@utils/mongoHelper';

const stats = catchAsync(async (req, res) => {
  const userId = toObjectId(req.user!._id);

  const referralStatusCounts = await Referral.aggregate([
    { $match: { referrerId: userId } },
    {
      $group: {
        _id: null,
        pending: {
          $sum: {
            $cond: [{ $eq: ["$status", REFERRAL_STATUS.PENDING] }, 1, 0],
          },
        },
        active: {
          $sum: {
            $cond: [{ $eq: ["$status", REFERRAL_STATUS.ACTIVE] }, 1, 0],
          },
        },
        total: { $sum: 1 },
      },
    },
  ]);

  const counts = referralStatusCounts[0] || { pending: 0, active: 0, total: 0 };

  return response.success(res, {
    onboardReferrals: {
      total: counts.total,
      pending: counts.pending,
      active: counts.active,
    },
  });
});

export { stats };
