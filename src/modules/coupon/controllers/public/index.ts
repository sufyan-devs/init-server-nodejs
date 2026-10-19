import Coupon, { COUPON_STATUS } from '@coupon/models/Coupon';
import catchAsync from '@utils/catchAsync';
import ApiError from '@utils/apiError';
import response from '@utils/response';
import { toObjectId, isValidObjectId } from '@utils/mongoHelper';
import { couponDecimalFields, todayDateRange } from '@coupon/helpers/mongo';

const publicProject = {
  __v: 0,
  isDeleted: 0,
  sellingPrice: 0,
  "referral.userId": 0,
  userId: 0,
};

const list = catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search = "",
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  const { startOfDay } = todayDateRange(req.headers["x-timezone"] as string);
  const query: any = {
    status: COUPON_STATUS.PUBLISHED,
    isDeleted: false,
    endDate: { $gte: startOfDay },
  };

  if ((search as string).trim()) {
    query.$or = [
      { title: { $regex: (search as string).trim(), $options: "i" } },
      { code: { $regex: (search as string).trim(), $options: "i" } },
      { description: { $regex: (search as string).trim(), $options: "i" } },
    ];
  }

  const sortStage = { [sortBy as string]: sortOrder === "asc" ? 1 : -1 };

  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
  const skip = (pageNum - 1) * limitNum;

  const [coupons, total] = await Promise.all([
    Coupon.aggregate([
      { $match: query },
      { $sort: sortStage as any },
      { $skip: skip },
      { $limit: limitNum },
      {
        $lookup: {
          from: "couponpurchases",
          let: { couponId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$couponId", "$$couponId"] },
                "payment.status": "PAID",
              },
            },
            { $group: { _id: null, total: { $sum: "$quantity" } } },
          ],
          as: "_collected",
        },
      },
      {
        $addFields: {
          totalCollected: {
            $ifNull: [{ $arrayElemAt: ["$_collected.total", 0] }, 0],
          },
        },
      },
      { $unset: "_collected" },
      couponDecimalFields,
      {
        $project: {
          title: 1,
          code: 1,
          description: 1,
          discount: 1,
          minimumOrderValue: 1,
          redeemLimit: 1,
          endDate: 1,
          totalCollected: 1,
        },
      },
    ] as any[]),
    Coupon.countDocuments(query),
  ]);

  return response.success(res, {
    coupons,
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

const getById = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid coupon ID");
  }

  const { startOfDay } = todayDateRange(req.headers["x-timezone"] as string);
  const [coupon] = await Coupon.aggregate([
    {
      $match: {
        _id: toObjectId(id as string),
        status: COUPON_STATUS.PUBLISHED,
        isDeleted: false,
        endDate: { $gte: startOfDay },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        pipeline: [{ $project: { firstName: 1, lastName: 1 } }],
        as: "vendor",
      },
    },
    { $addFields: { vendor: { $arrayElemAt: ["$vendor", 0] } } },
    couponDecimalFields,
    { $project: { ...publicProject, userId: 0, "referral.userId": 0 } },
  ] as any[]);

  if (!coupon) {
    throw ApiError.notFound("Coupon not found");
  }

  return response.success(res, { coupon });
});

export { list, getById };
