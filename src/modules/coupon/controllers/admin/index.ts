import Coupon from '@coupon/models/Coupon';
import catchAsync from '@utils/catchAsync';
import ApiError from '@utils/apiError';
import response from '@utils/response';
import { toObjectId, isValidObjectId } from '@utils/mongoHelper';
import { couponDecimalFields } from '@coupon/helpers/mongo';

const lookupStages: any[] = [
  {
    $lookup: {
      from: "users",
      localField: "userId",
      foreignField: "_id",
      pipeline: [{ $project: { firstName: 1, lastName: 1, email: 1 } }],
      as: "vendor",
    },
  },
  {
    $addFields: {
      vendor: { $arrayElemAt: ["$vendor", 0] },
    },
  },
  {
    $lookup: {
      from: "users",
      localField: "referral.userId",
      foreignField: "_id",
      pipeline: [{ $project: { firstName: 1, lastName: 1, email: 1 } }],
      as: "referralUser",
    },
  },
  {
    $addFields: {
      "referral.user": { $arrayElemAt: ["$referralUser", 0] },
    },
  },
  couponDecimalFields,
  {
    $project: {
      referralUser: 0,
      __v: 0,
      isDeleted: 0,
      sellingPrice: 0,
      userId: 0,
      "referral.userId": 0,
      createdAt: 0,
      updatedAt: 0,
    },
  },
];


const list = catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search = "",
    isAll = "false",
    status,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  const query: any = { isDeleted: false };
  if (status) query.status = status;
  if ((search as string).trim()) {
    query.$or = [
      { title: { $regex: (search as string).trim(), $options: "i" } },
      { code: { $regex: (search as string).trim(), $options: "i" } },
      { description: { $regex: (search as string).trim(), $options: "i" } },
    ];
  }

  const sortStage = { [sortBy as string]: sortOrder === "asc" ? 1 : -1 };

  if (isAll === "true") {
    const coupons = await Coupon.aggregate([
      { $match: query },
      { $sort: sortStage },
      ...lookupStages,
    ] as any[]);

    return response.success(res, { coupons, total: coupons.length });
  }

  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
  const skip = (pageNum - 1) * limitNum;

  const [coupons, total] = await Promise.all([
    Coupon.aggregate([
      { $match: query },
      { $sort: sortStage },
      { $skip: skip },
      { $limit: limitNum },
      ...lookupStages,
      {
        $project: {
          title: 1,
          code: 1,
          discount: 1,
          status: 1,
          startDate: 1,
          endDate: 1,
          vendor: 1,
          "referral.type": 1,
          "referral.user": 1,
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

  const [coupon] = await Coupon.aggregate([
    { $match: { _id: toObjectId(id as string), isDeleted: false } },
    ...lookupStages,
  ] as any[]);

  if (!coupon) {
    throw ApiError.notFound("Coupon not found");
  }

  return response.success(res, { coupon });
});

const approve = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid coupon ID");
  }

  const coupon = await Coupon.findOne({ _id: id, isDeleted: false });
  if (!coupon) {
    throw ApiError.notFound("Coupon not found");
  }

  await coupon.approve();

  return response.success(res, {
    coupon,
    message: "Coupon approved",
  });
});

const publish = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid coupon ID");
  }

  const coupon = await Coupon.findOne({ _id: id, isDeleted: false });
  if (!coupon) {
    throw ApiError.notFound("Coupon not found");
  }

  await coupon.publish();

  return response.success(res, {
    coupon,
    message: "Coupon published",
  });
});

const reject = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid coupon ID");
  }

  const coupon = await Coupon.findOne({ _id: id, isDeleted: false });
  if (!coupon) {
    throw ApiError.notFound("Coupon not found");
  }

  await coupon.reject();

  return response.success(res, {
    coupon,
    message: "Coupon rejected and moved back to draft",
  });
});

const deactivate = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid coupon ID");
  }

  const coupon = await Coupon.findOne({ _id: id, isDeleted: false });
  if (!coupon) {
    throw ApiError.notFound("Coupon not found");
  }

  await coupon.deactivate();

  return response.success(res, {
    coupon,
    message: "Coupon deactivated",
  });
});

export {
  list,
  getById,
  approve,
  publish,
  reject,
  deactivate,
};
