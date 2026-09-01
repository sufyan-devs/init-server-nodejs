import Coupon, { COUPON_STATUS } from '@coupon/models/Coupon';
import CouponRedeem, { REDEEM_STATUS } from '@coupon/models/CouponRedeem';
import catchAsync from '@utils/catchAsync';
import response from '@utils/response';
import { toObjectId } from '@utils/mongoHelper';

const stats = catchAsync(async (req, res) => {
  const vendorId = toObjectId(req.user!._id);

  const vendorCouponIds = await Coupon.distinct("_id", {
    userId: vendorId,
  });

  const [couponCounts, redeemStats] = await Promise.all([
    Coupon.aggregate([
      { $match: { userId: vendorId, isDeleted: false } },
      {
        $group: {
          _id: null,
          published: {
            $sum: {
              $cond: [{ $eq: ["$status", COUPON_STATUS.PUBLISHED] }, 1, 0],
            },
          },
          draft: {
            $sum: {
              $cond: [{ $eq: ["$status", COUPON_STATUS.DRAFT] }, 1, 0],
            },
          },
        },
      },
    ]),

    CouponRedeem.aggregate([
      {
        $match: {
          couponId: { $in: vendorCouponIds },
          status: REDEEM_STATUS.REDEEMED,
        },
      },
      {
        $lookup: {
          from: "couponpurchases",
          localField: "purchaseId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                "snapshot.discount": 1,
                "snapshot.minimumOrderValue": 1,
              },
            },
          ],
          as: "purchase",
        },
      },
      { $addFields: { purchase: { $arrayElemAt: ["$purchase", 0] } } },
      {
        $addFields: {
          discountAmount: {
            $cond: {
              if: { $eq: ["$purchase.snapshot.discount.type", "FIXED"] },
              then: {
                $multiply: [
                  {
                    $toDouble: {
                      $ifNull: ["$purchase.snapshot.discount.value", 0],
                    },
                  },
                  "$redeemedQty",
                ],
              },
              else: {
                $multiply: [
                  {
                    $divide: [
                      {
                        $toDouble: {
                          $ifNull: ["$purchase.snapshot.discount.value", 0],
                        },
                      },
                      100,
                    ],
                  },
                  {
                    $toDouble: {
                      $ifNull: ["$purchase.snapshot.minimumOrderValue", 0],
                    },
                  },
                  "$redeemedQty",
                ],
              },
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          totalRedeemed: { $sum: 1 },
          totalRedeemedAmount: { $sum: "$discountAmount" },
        },
      },
    ]),
  ]);

  const counts = couponCounts[0] || { published: 0, draft: 0 };
  const redeem = redeemStats[0] || { totalRedeemed: 0, totalRedeemedAmount: 0 };

  return response.success(res, {
    publishedCoupons: counts.published,
    draftCoupons: counts.draft,
    totalRedeemed: redeem.totalRedeemed,
    totalRedeemedAmount: redeem.totalRedeemedAmount,
  });
});



export { stats };
