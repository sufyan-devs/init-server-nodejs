import Coupon, { COUPON_STATUS } from '@coupon/models/Coupon';
import catchAsync from '@utils/catchAsync';
import response from '@utils/response';
import { toObjectId } from '@utils/mongoHelper';

const list = catchAsync(async (req, res) => {
  const userId = toObjectId(req.user!._id);
  const {
    page = 1,
    limit = 20,
    status,
    search,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
  const skip = (pageNum - 1) * limitNum;

  const filter: any = { "referral.userId": userId, isDeleted: false };
  if (status && Object.values(COUPON_STATUS).includes(status as any)) {
    filter.status = status;
  }
  if ((search as string)?.trim()) {
    const regex = { $regex: (search as string).trim(), $options: "i" };
    filter.$or = [{ title: regex }, { code: regex }];
  }

  const [coupons, total] = await Promise.all([
    Coupon.aggregate([
      { $match: filter },
      { $sort: { [sortBy as string]: sortOrder === "asc" ? 1 : -1 } },
      { $skip: skip },
      { $limit: limitNum },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          pipeline: [{ $project: { firstName: 1, lastName: 1 } }],
          as: "owner",
        },
      },
      { $addFields: { owner: { $arrayElemAt: ["$owner", 0] } } },
      {
        $project: {
          title: 1,
          code: 1,
          status: 1,
          vendor: {
            $concat: [
              { $ifNull: ["$owner.firstName", ""] },
              " ",
              { $ifNull: ["$owner.lastName", ""] },
            ],
          },
        },
      },
    ]),
    Coupon.countDocuments(filter),
  ]);

  return response.success(res, {
    coupons,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});



export { list };
