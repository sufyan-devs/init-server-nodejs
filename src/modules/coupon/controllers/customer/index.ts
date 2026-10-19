import Coupon, { COUPON_STATUS } from '@coupon/models/Coupon';
import CouponPurchase, { PAYMENT_STATUS } from '@coupon/models/CouponPurchase';
import CouponRedeem from '@coupon/models/CouponRedeem';
import User from '@user/models/User';
import catchAsync from '@utils/catchAsync';
import ApiError from '@utils/apiError';
import response from '@utils/response';
import { toObjectId, isValidObjectId } from '@utils/mongoHelper';
import { purchaseDecimalFields, todayDateRange, formatDate } from '@coupon/helpers/mongo';

const purchase = catchAsync(async (req, res) => {
  const { couponId, quantity = 1 } = req.body ?? {};

  if (!isValidObjectId(couponId)) {
    throw ApiError.badRequest("Invalid coupon ID");
  }

  const coupon = await Coupon.findOne({ _id: couponId, isDeleted: false });
  if (!coupon) {
    throw ApiError.notFound("Coupon not found");
  }
  if (coupon.status !== COUPON_STATUS.PUBLISHED) {
    throw ApiError.badRequest("Coupon is not available to collect");
  }

  const { startOfDay, endOfDay } = todayDateRange(req.headers["x-timezone"] as string);

  if (coupon.startDate > endOfDay) {
    const availableDate = formatDate(coupon.startDate);
    throw ApiError.badRequest(
      `This coupon is not yet available. It starts on ${availableDate}`,
    );
  }

  if (coupon.endDate < startOfDay) {
    throw ApiError.badRequest("Coupon has expired");
  }

  const existingPurchases = await CouponPurchase.aggregate([
    {
      $match: {
        couponId: toObjectId(couponId),
        userId: toObjectId(req.user!._id),
        "payment.status": PAYMENT_STATUS.PAID,
      },
    },
    { $group: { _id: null, totalQty: { $sum: "$quantity" } } },
  ]);

  const alreadyPurchased = existingPurchases[0]?.totalQty || 0;
  if (alreadyPurchased + quantity > coupon.redeemLimit.perUser) {
    throw ApiError.badRequest(
      `Per-user limit is ${coupon.redeemLimit.perUser}. You already collected ${alreadyPurchased}`,
    );
  }

  const totalPurchases = await CouponPurchase.aggregate([
    {
      $match: {
        couponId: toObjectId(couponId),
        "payment.status": PAYMENT_STATUS.PAID,
      },
    },
    { $group: { _id: null, totalQty: { $sum: "$quantity" } } },
  ]);

  const totalSold = totalPurchases[0]?.totalQty || 0;
  if (totalSold + quantity > coupon.redeemLimit.total) {
    throw ApiError.badRequest("Coupon is sold out");
  }

  const existingPurchase = await CouponPurchase.findOne({
    couponId: coupon._id,
    userId: req.user!._id,
    "payment.status": PAYMENT_STATUS.PAID,
  });

  let purchaseRecord;

  if (existingPurchase) {
    existingPurchase.quantity += quantity;
    purchaseRecord = await existingPurchase.save();
  } else {
    purchaseRecord = await CouponPurchase.create({
      couponId: coupon._id,
      userId: req.user!._id,
      quantity,
      unitPrice: 0,
      totalAmount: 0,
      snapshot: {
        title: coupon.title,
        code: coupon.code,
        description: coupon.description,
        discount: {
          type: coupon.discount.type,
          value: coupon.discount.value,
        },
        sellingPrice: 0,
        minimumOrderValue: coupon.minimumOrderValue,
        startDate: coupon.startDate,
        endDate: coupon.endDate,
      },
      payment: {
        status: PAYMENT_STATUS.PAID,
        method: "other",
      },
      purchasedAt: new Date(),
    });
  }

  if (totalSold + quantity >= coupon.redeemLimit.total) {
    await coupon.markSoldOut();
  }

  return response.created(res, { purchase: purchaseRecord });
});

const myPurchases = catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    sortBy = "purchasedAt",
    sortOrder = "desc",
  } = req.query;

  const query = {
    userId: toObjectId(req.user!._id),
    "payment.status": PAYMENT_STATUS.PAID,
  };

  const sortStage = { [sortBy as string]: sortOrder === "asc" ? 1 : -1 };

  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
  const skip = (pageNum - 1) * limitNum;

  const [purchases, total] = await Promise.all([
    CouponPurchase.aggregate([
      { $match: query },
      { $sort: sortStage as any },
      { $skip: skip },
      { $limit: limitNum },
      {
        $lookup: {
          from: "coupons",
          localField: "couponId",
          foreignField: "_id",
          pipeline: [{ $project: { title: 1, code: 1, status: 1 } }],
          as: "coupon",
        },
      },
      { $addFields: { coupon: { $arrayElemAt: ["$coupon", 0] } } },
      {
        $lookup: {
          from: "couponredeems",
          localField: "_id",
          foreignField: "purchaseId",
          pipeline: [
            { $match: { status: "REDEEMED" } },
            { $group: { _id: null, total: { $sum: "$redeemedQty" } } },
          ],
          as: "_redeemedSum",
        },
      },
      {
        $lookup: {
          from: "couponredeems",
          localField: "_id",
          foreignField: "purchaseId",
          pipeline: [
            { $match: { status: "ACTIVE" } },
            { $project: { redemptionCode: 1 } },
            { $limit: 1 },
          ],
          as: "_activeRedeem",
        },
      },
      {
        $addFields: {
          redeemedQty: {
            $ifNull: [{ $arrayElemAt: ["$_redeemedSum.total", 0] }, 0],
          },
          activeRedeem: { $arrayElemAt: ["$_activeRedeem", 0] },
        },
      },
      { $unset: ["_redeemedSum", "_activeRedeem"] },
      purchaseDecimalFields,
      {
        $project: {
          __v: 0,
          userId: 0,
          unitPrice: 0,
          totalAmount: 0,
          "snapshot.sellingPrice": 0,
        },
      },
    ] as any[]),
    CouponPurchase.countDocuments(query),
  ]);

  return response.success(res, {
    purchases,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
      hasNext: pageNum * limitNum < total,
      hasPrev: pageNum > 1,
    },
  });
});

const generateRedeemCode = catchAsync(async (req, res) => {
  const { purchaseId } = req.params;

  if (!isValidObjectId(purchaseId)) {
    throw ApiError.badRequest("Invalid purchase ID");
  }

  const purchaseRecord = await CouponPurchase.findOne({
    _id: purchaseId,
    userId: req.user!._id,
    "payment.status": PAYMENT_STATUS.PAID,
  });

  if (!purchaseRecord) {
    throw ApiError.notFound("Purchase not found");
  }

  const user = await User.findById(req.user!._id);
  if (!user || !user.emailVerified) {
    throw ApiError.badRequest(
      "Email verification required to generate redemption code",
    );
  }

  const { startOfDay } = todayDateRange(req.headers["x-timezone"] as string);
  const endDate = purchaseRecord.snapshot?.endDate;
  if (endDate && endDate < startOfDay) {
    throw ApiError.badRequest("Coupon has expired");
  }

  try {
    const redeem = await CouponRedeem.generateCode({
      purchaseId: purchaseRecord._id,
      couponId: purchaseRecord.couponId,
      userId: req.user!._id,
      purchasedQty: purchaseRecord.quantity,
    });

    return response.created(res, { redeem });
  } catch (err: unknown) {
    throw ApiError.badRequest((err as Error).message);
  }
});

export { purchase, myPurchases, generateRedeemCode };
