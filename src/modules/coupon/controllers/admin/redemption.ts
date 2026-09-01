import CouponRedeem, { REDEEM_STATUS } from '@coupon/models/CouponRedeem';
import catchAsync from '@utils/catchAsync';
import ApiError from '@utils/apiError';
import response from '@utils/response';
import { toObjectId, isValidObjectId } from '@utils/mongoHelper';

const LOOKUP_STAGES = [
  {
    $lookup: {
      from: "users",
      localField: "userId",
      foreignField: "_id",
      pipeline: [{ $project: { firstName: 1, lastName: 1 } }],
      as: "customer",
    },
  },
  { $addFields: { customer: { $arrayElemAt: ["$customer", 0] } } },
  {
    $lookup: {
      from: "users",
      localField: "redeemedByUserId",
      foreignField: "_id",
      pipeline: [{ $project: { firstName: 1, lastName: 1 } }],
      as: "redeemedBy",
    },
  },
  { $addFields: { redeemedBy: { $arrayElemAt: ["$redeemedBy", 0] } } },
  {
    $lookup: {
      from: "couponpurchases",
      localField: "purchaseId",
      foreignField: "_id",
      pipeline: [{ $project: { "snapshot.title": 1, "snapshot.code": 1 } }],
      as: "purchase",
    },
  },
  { $addFields: { purchase: { $arrayElemAt: ["$purchase", 0] } } },
];

const PROJECT_STAGE = {
  $project: {
    redemptionCode: 1,
    redeemedQty: 1,
    redeemedAt: 1,
    orderReference: 1,
    couponTitle: "$purchase.snapshot.title",
    couponCode: "$purchase.snapshot.code",
    customer: { firstName: 1, lastName: 1 },
    redeemedBy: { firstName: 1, lastName: 1 },
  },
};

const couponRedemptions = catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search = "",
    sortBy = "redeemedAt",
    sortOrder = "desc",
  } = req.query;

  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
  const skip = (pageNum - 1) * limitNum;

  const filter = { status: REDEEM_STATUS.REDEEMED };
  const hasSearch = (search as string).trim().length > 0;

  const basePipeline: any[] = [{ $match: filter }];

  if (hasSearch) {
    const searchRegex = { $regex: (search as string).trim(), $options: "i" };
    basePipeline.push(...LOOKUP_STAGES, {
      $match: {
        $or: [
          { "purchase.snapshot.title": searchRegex },
          { "purchase.snapshot.code": searchRegex },
          { redemptionCode: searchRegex },
          { "customer.firstName": searchRegex },
          { "customer.lastName": searchRegex },
          { "redeemedBy.firstName": searchRegex },
          { "redeemedBy.lastName": searchRegex },
        ],
      },
    });
  }

  const [redemptions, countResult] = await Promise.all([
    CouponRedeem.aggregate([
      ...basePipeline,
      { $sort: { [sortBy as string]: sortOrder === "asc" ? 1 : -1 } },
      { $skip: skip },
      { $limit: limitNum },
      ...(!hasSearch ? LOOKUP_STAGES : []),
      PROJECT_STAGE,
    ]),
    hasSearch
      ? CouponRedeem.aggregate([...basePipeline, { $count: "total" }])
      : CouponRedeem.countDocuments(filter),
  ]);

  const total = hasSearch ? (countResult as any[])[0]?.total || 0 : countResult;

  return response.success(res, {
    redemptions,
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

const couponRedemptionDetail = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid redemption ID");
  }

  const [result] = await CouponRedeem.aggregate([
    {
      $match: {
        _id: toObjectId(id as string),
        status: REDEEM_STATUS.REDEEMED,
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        pipeline: [{ $project: { firstName: 1, lastName: 1, email: 1 } }],
        as: "customer",
      },
    },
    { $addFields: { customer: { $arrayElemAt: ["$customer", 0] } } },
    {
      $lookup: {
        from: "users",
        localField: "redeemedByUserId",
        foreignField: "_id",
        pipeline: [{ $project: { firstName: 1, lastName: 1 } }],
        as: "redeemedBy",
      },
    },
    { $addFields: { redeemedBy: { $arrayElemAt: ["$redeemedBy", 0] } } },
    {
      $lookup: {
        from: "couponpurchases",
        localField: "purchaseId",
        foreignField: "_id",
        pipeline: [
          {
            $project: {
              quantity: 1,
              "snapshot.title": 1,
              "snapshot.code": 1,
              "snapshot.discount": 1,
              "snapshot.minimumOrderValue": 1,
              "snapshot.startDate": 1,
              "snapshot.endDate": 1,
              "snapshot.description": 1,
            },
          },
        ],
        as: "purchase",
      },
    },
    { $addFields: { purchase: { $arrayElemAt: ["$purchase", 0] } } },
    {
      $addFields: {
        "purchase.snapshot.discount.value": {
          $toDouble: "$purchase.snapshot.discount.value",
        },
        "purchase.snapshot.minimumOrderValue": {
          $toDouble: "$purchase.snapshot.minimumOrderValue",
        },
      },
    },
    {
      $project: {
        redemptionCode: 1,
        redeemedQty: 1,
        redeemedAt: 1,
        orderReference: 1,
        couponTitle: "$purchase.snapshot.title",
        couponCode: "$purchase.snapshot.code",
        customer: { firstName: 1, lastName: 1, email: 1 },
        redeemedBy: { firstName: 1, lastName: 1 },
        snapshot: {
          title: "$purchase.snapshot.title",
          code: "$purchase.snapshot.code",
          discount: "$purchase.snapshot.discount",
          minimumOrderValue: "$purchase.snapshot.minimumOrderValue",
          startDate: "$purchase.snapshot.startDate",
          endDate: "$purchase.snapshot.endDate",
          description: "$purchase.snapshot.description",
        },
        purchasedQty: "$purchase.quantity",
      },
    },
  ]);

  return response.success(res, { redemption: result });
});

export {
  couponRedemptions,
  couponRedemptionDetail,
};
