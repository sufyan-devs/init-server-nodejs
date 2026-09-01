import Coupon, { COUPON_STATUS } from '@coupon/models/Coupon';
import CouponPurchase from '@coupon/models/CouponPurchase';
import catchAsync from '@utils/catchAsync';
import response from '@utils/response';

const stats = catchAsync(async (_req, res) => {
  const [couponCounts, purchaseRevenue] = await Promise.all([
    Coupon.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: null,
          totalCoupons: { $sum: 1 },
          publishedCoupons: {
            $sum: {
              $cond: [{ $eq: ["$status", COUPON_STATUS.PUBLISHED] }, 1, 0],
            },
          },
        },
      },
    ]),

    CouponPurchase.aggregate([
      { $match: { "payment.status": "PAID" } },
      {
        $group: {
          _id: null,
          totalRevenue: {
            $sum: {
              $multiply: [
                { $toDouble: { $ifNull: ["$snapshot.sellingPrice", 0] } },
                "$quantity",
              ],
            },
          },
        },
      },
    ]),
  ]);

  const counts = couponCounts[0] || { totalCoupons: 0, publishedCoupons: 0 };
  const revenue = purchaseRevenue[0] || { totalRevenue: 0 };

  return response.success(res, {
    totalCoupons: counts.totalCoupons,
    publishedCoupons: counts.publishedCoupons,
    totalPurchaseRevenue: revenue.totalRevenue,
  });
});



export { stats };
