import Coupon, { COUPON_STATUS, REFERRAL_TYPE as COUPON_REFERRAL_TYPE } from '@coupon/models/Coupon';
import CouponPurchase from '@coupon/models/CouponPurchase';
import CouponRedeem, { REDEEM_STATUS } from '@coupon/models/CouponRedeem';
import Referral from '@referral/models/Referral';
import User from '@user/models/User';
import { sendEmail, templates } from '@notification/email';
import catchAsync from '@utils/catchAsync';
import ApiError from '@utils/apiError';
import response from '@utils/response';
import {
  toObjectId,
  isValidObjectId,
  couponDecimalFields,
  getDecimal,
  todayDateRange,
  formatDate,
} from '@utils/mongoHelper';
const vendorSanitize = (coupon: any) => {
  const obj = coupon.toJSON ? coupon.toJSON() : { ...coupon };
  delete obj.sellingPrice;
  delete obj.userId;
  delete obj.createdAt;
  delete obj.updatedAt;
  return obj;
};

const create = catchAsync(async (req, res) => {
  const {
    title,
    code,
    description,
    referralType,
    discount,
    minimumOrderValue,
    redeemLimit,
    startDate,
    endDate,
  } = req.body;

  if (redeemLimit?.total != null && redeemLimit?.perUser != null) {
    if (redeemLimit.perUser > redeemLimit.total) {
      throw ApiError.badRequest(
        "Per-user limit cannot exceed the total redeem limit",
      );
    }
    if (redeemLimit.total % redeemLimit.perUser !== 0) {
      throw ApiError.badRequest(
        `Total limit (${redeemLimit.total}) must be divisible by per-user limit (${redeemLimit.perUser}) so every customer can always collect the same quantity`,
      );
    }
  }

  const existing = await Coupon.findOne({
    userId: req.user!._id,
    code: code.toUpperCase(),
    isDeleted: false,
  });
  if (existing) {
    throw ApiError.conflict("You already have a coupon with this code");
  }

  const referral: any = { type: COUPON_REFERRAL_TYPE.DIRECT, userId: null };

  if (referralType === COUPON_REFERRAL_TYPE.REFERRAL) {
    const referralRecord = await Referral.findOne({
      referredUserId: req.user!._id,
    });
    if (!referralRecord) {
      throw ApiError.badRequest(
        "No referral record found. You were not referred by a Business Associate",
      );
    }
    referral.type = COUPON_REFERRAL_TYPE.REFERRAL;
    referral.userId = referralRecord.referrerId;
  }

  const coupon = await Coupon.create({
    title,
    code,
    description,
    userId: req.user!._id,
    referral,
    discount,
    minimumOrderValue,
    redeemLimit,
    startDate,
    endDate,
    status: COUPON_STATUS.DRAFT,
  });

  return response.created(res, { coupon: vendorSanitize(coupon) });
});

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

  const query: any = { userId: toObjectId(req.user!._id), isDeleted: false };
  if (status) query.status = status;
  if ((search as string).trim()) {
    query.$or = [
      { title: { $regex: (search as string).trim(), $options: "i" } },
      { code: { $regex: (search as string).trim(), $options: "i" } },
      { description: { $regex: (search as string).trim(), $options: "i" } },
    ];
  }

  const sortStage = { [sortBy as string]: sortOrder === "asc" ? 1 : -1 };

  const lookupStages = [
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
        createdAt: 0,
        updatedAt: 0,
      },
    },
  ];

  if (isAll === "true") {
    const coupons = await Coupon.aggregate([
      { $match: query },
      { $sort: sortStage as any },
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
      { $sort: sortStage as any },
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
    {
      $match: {
        _id: toObjectId(id as string),
        userId: toObjectId(req.user!._id),
        isDeleted: false,
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
        createdAt: 0,
        updatedAt: 0,
      },
    },
  ] as any[]);

  if (!coupon) {
    throw ApiError.notFound("Coupon not found");
  }

  return response.success(res, { coupon });
});

const EDITABLE_FIELDS_BY_STATUS: Record<string, string[]> = {
  [COUPON_STATUS.DRAFT]: [
    "title",
    "code",
    "description",
    "discount",
    "minimumOrderValue",
    "redeemLimit",
    "startDate",
    "endDate",
  ],
  [COUPON_STATUS.PUBLISHED]: ["title", "description"],
  [COUPON_STATUS.INACTIVE]: ["title", "description"],
};

const update = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid coupon ID");
  }

  const coupon = await Coupon.findOne({
    _id: id,
    userId: req.user!._id,
    isDeleted: false,
  });

  if (!coupon) {
    throw ApiError.notFound("Coupon not found");
  }

  const allowedFields = EDITABLE_FIELDS_BY_STATUS[coupon.status];
  if (!allowedFields) {
    throw ApiError.badRequest(
      `Cannot update coupon with status: ${coupon.status}`,
    );
  }

  const disallowed = Object.keys(req.body).filter(
    (f) => !allowedFields.includes(f),
  );
  if (disallowed.length) {
    throw ApiError.badRequest(
      `Cannot update fields [${disallowed.join(", ")}] when status is ${coupon.status}`,
    );
  }

  if (req.body.redeemLimit) {
    const effectiveTotal =
      req.body.redeemLimit.total ?? coupon.redeemLimit?.total;
    const effectivePerUser =
      req.body.redeemLimit.perUser ?? coupon.redeemLimit?.perUser;
    if (effectiveTotal != null && effectivePerUser != null) {
      if (effectivePerUser > effectiveTotal) {
        throw ApiError.badRequest(
          "Per-user limit cannot exceed the total redeem limit",
        );
      }
      if (effectiveTotal % effectivePerUser !== 0) {
        throw ApiError.badRequest(
          `Total limit (${effectiveTotal}) must be divisible by per-user limit (${effectivePerUser}) so every customer can always collect the same quantity`,
        );
      }
    }
  }

  if (req.body.code) {
    const duplicate = await Coupon.findOne({
      userId: req.user!._id,
      code: req.body.code.toUpperCase(),
      _id: { $ne: coupon._id },
      isDeleted: false,
    });
    if (duplicate) {
      throw ApiError.conflict("You already have a coupon with this code");
    }
  }
  coupon.set(req.body);

  await coupon.save();

  return response.success(res, { coupon: vendorSanitize(coupon) });
});

const submit = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid coupon ID");
  }

  const coupon = await Coupon.findOne({
    _id: id,
    userId: req.user!._id,
    isDeleted: false,
  });

  if (!coupon) {
    throw ApiError.notFound("Coupon not found");
  }

  await coupon.submit();

  return response.success(res, {
    coupon: vendorSanitize(coupon),
    message: "Coupon submitted for approval",
  });
});

const deactivate = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid coupon ID");
  }

  const coupon = await Coupon.findOne({
    _id: id,
    userId: req.user!._id,
    isDeleted: false,
  });

  if (!coupon) {
    throw ApiError.notFound("Coupon not found");
  }

  await coupon.deactivate();

  return response.success(res, {
    coupon: vendorSanitize(coupon),
    message: "Coupon deactivated",
  });
});

const remove = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid coupon ID");
  }

  const coupon = await Coupon.findOne({
    _id: id,
    userId: req.user!._id,
    isDeleted: false,
  });

  if (!coupon) {
    throw ApiError.notFound("Coupon not found");
  }

  if (coupon.status !== COUPON_STATUS.DRAFT) {
    throw ApiError.badRequest(
      `Cannot delete coupon with status: ${coupon.status}. Only DRAFT coupons can be deleted.`,
    );
  }

  coupon.isDeleted = true;
  await coupon.save();

  return response.success(res, { message: "Coupon deleted" });
});

const verifyRedemptionCode = catchAsync(async (req, res) => {
  const { redemptionCode, quantity } = req.body;

  if (!redemptionCode || !quantity || quantity < 1) {
    throw ApiError.badRequest(
      "Redemption code and quantity (>= 1) are required",
    );
  }

  const [result] = await CouponRedeem.aggregate([
    {
      $match: {
        redemptionCode: redemptionCode.toUpperCase().trim(),
        status: REDEEM_STATUS.ACTIVE,
      },
    },
    { $limit: 1 },
    {
      $lookup: {
        from: "couponredeems",
        let: { pid: "$purchaseId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$purchaseId", "$$pid"] },
                  { $eq: ["$status", REDEEM_STATUS.REDEEMED] },
                ],
              },
            },
          },
          { $group: { _id: null, total: { $sum: "$redeemedQty" } } },
        ],
        as: "_consumed",
      },
    },
    {
      $addFields: {
        totalRedeemed: {
          $ifNull: [{ $arrayElemAt: ["$_consumed.total", 0] }, 0],
        },
      },
    },
    { $project: { _consumed: 0, __v: 0 } },
  ]);

  if (!result) {
    throw ApiError.notFound("Invalid or expired redemption code");
  }

  const [coupon, purchase, customer] = await Promise.all([
    Coupon.findOne({
      _id: result.couponId,
      isDeleted: false,
    }).select("userId"),
    CouponPurchase.findById(result.purchaseId).select("quantity snapshot"),
    User.findById(result.userId).select("email firstName"),
  ]);

  if (!coupon) {
    throw ApiError.notFound("Coupon not found");
  }

  if (coupon.userId.toString() !== req.user!._id.toString()) {
    throw ApiError.forbidden("This redemption code is not for your coupon");
  }

  if (!purchase) {
    throw ApiError.notFound("Purchase record not found");
  }

  const { startOfDay, endOfDay } = todayDateRange(req.headers["x-timezone"] as string);

  if (purchase.snapshot.startDate > endOfDay) {
    const availableDate = formatDate(purchase.snapshot.startDate);
    throw ApiError.badRequest(
      `This coupon is not yet available. It starts on ${availableDate}`,
    );
  }

  if (purchase.snapshot.endDate < startOfDay) {
    throw ApiError.badRequest("This coupon has expired");
  }

  const remaining = purchase.quantity - result.totalRedeemed;

  if (quantity > remaining) {
    throw ApiError.badRequest(
      `Requested quantity (${quantity}) exceeds remaining (${remaining})`,
    );
  }

  const redeemRecord = (await CouponRedeem.findById(result._id))!;
  redeemRecord.redeemedQty = quantity;
  const otpCode = await redeemRecord.sendOTP();

  // fire-and-forget, no await
  if (customer?.email) {
    const { subject, html } = templates.couponOtp({
      firstName: customer.firstName,
      otpCode,
    });
    sendEmail({ to: customer.email, subject, html, type: "coupon_otp" });
  }

  const maskedEmail = customer?.email
    ? customer.email.replace(
        /^(.)(.*)(@.*)$/,
        (_: string, first: string, middle: string, domain: string) =>
          first + "*".repeat(Math.min(middle.length, 5)) + domain,
      )
    : "***@***";

  return response.success(res, {
    redeemId: result._id,
    maskedEmail,
    quantity,
    snapshot: {
      title: purchase.snapshot.title,
      code: purchase.snapshot.code,
      discount: {
        type: purchase.snapshot.discount.type,
        value: getDecimal(purchase.snapshot.discount.value),
      },
      minimumOrderValue: getDecimal(purchase.snapshot.minimumOrderValue),
      endDate: purchase.snapshot.endDate,
    },
  });
});

const verifyRedemptionOtp = catchAsync(async (req, res) => {
  const { redeemId, otp } = req.body;

  if (!redeemId || !otp) {
    throw ApiError.badRequest("Redeem ID and OTP are required");
  }

  if (!isValidObjectId(redeemId)) {
    throw ApiError.badRequest("Invalid redeem ID");
  }

  const redeemRecord = await CouponRedeem.findOne({
    _id: redeemId,
    status: REDEEM_STATUS.ACTIVE,
  });

  if (!redeemRecord) {
    throw ApiError.notFound(
      "Redemption session not found or already completed",
    );
  }

  const coupon = await Coupon.findOne({
    _id: redeemRecord.couponId,
    userId: req.user!._id,
    isDeleted: false,
  });

  if (!coupon) {
    throw ApiError.forbidden("Unauthorized");
  }

  try {
    await redeemRecord.verifyOTP(otp.toString().trim());
  } catch (err: unknown) {
    throw ApiError.badRequest((err as Error).message);
  }

  const purchase = (await CouponPurchase.findById(redeemRecord.purchaseId))!;

  return response.success(res, {
    redeemId: redeemRecord._id,
    verified: true,
    quantity: redeemRecord.redeemedQty,
    snapshot: {
      title: purchase.snapshot.title,
      code: purchase.snapshot.code,
      discount: {
        type: purchase.snapshot.discount.type,
        value: getDecimal(purchase.snapshot.discount.value),
      },
      minimumOrderValue: getDecimal(purchase.snapshot.minimumOrderValue),
      startDate: purchase.snapshot.startDate,
      endDate: purchase.snapshot.endDate,
      description: purchase.snapshot.description,
    },
  });
});

const confirmRedemption = catchAsync(async (req, res) => {
  const { redeemId, orderReference } = req.body;

  if (!redeemId) {
    throw ApiError.badRequest("Redeem ID is required");
  }

  if (!isValidObjectId(redeemId)) {
    throw ApiError.badRequest("Invalid redeem ID");
  }

  const redeemRecord = await CouponRedeem.findOne({
    _id: redeemId,
    status: REDEEM_STATUS.ACTIVE,
  });

  if (!redeemRecord) {
    throw ApiError.notFound(
      "Redemption session not found or already completed",
    );
  }

  const coupon = await Coupon.findOne({
    _id: redeemRecord.couponId,
    userId: req.user!._id,
    isDeleted: false,
  });

  if (!coupon) {
    throw ApiError.forbidden("Unauthorized");
  }

  try {
    await redeemRecord.redeem(req.user!._id, {
      redeemQty: redeemRecord.redeemedQty,
      orderReference: orderReference?.trim() || null,
    });
  } catch (err: unknown) {
    throw ApiError.badRequest((err as Error).message);
  }

  const [purchase, customer] = await Promise.all([
    CouponPurchase.findById(redeemRecord.purchaseId).select("snapshot"),
    User.findById(redeemRecord.userId).select("email firstName lastName"),
  ]);

  const snap = purchase?.snapshot;
  const redemptionDetails = {
    couponTitle: snap?.title ?? '',
    couponCode: snap?.code ?? '',
    redeemedQty: redeemRecord.redeemedQty,
    redeemedAt: formatDate(redeemRecord.redeemedAt!),
    orderReference: redeemRecord.orderReference,
  };

  // fire-and-forget
  if (customer?.email) {
    const { subject, html } = templates.customerRedemptionConfirmation({
      firstName: customer.firstName,
      ...redemptionDetails,
      vendorName: `${req.user!.firstName} ${req.user!.lastName}`.trim() || "Vendor",
    });
    sendEmail({
      to: customer.email,
      subject,
      html,
      type: "coupon_redemption_customer",
    });
  }

  // fire-and-forget
  if (req.user!.email) {
    const { subject, html } = templates.vendorRedemptionConfirmation({
      firstName: req.user!.firstName,
      ...redemptionDetails,
      customerName: `${customer?.firstName || ""} ${customer?.lastName || ""}`.trim() || "Customer",
    });
    sendEmail({
      to: req.user!.email,
      subject,
      html,
      type: "coupon_redemption_vendor",
    });
  }

  return response.success(res, {
    redeemId: redeemRecord._id,
    status: redeemRecord.status,
    redeemedQty: redeemRecord.redeemedQty,
    redeemedAt: redeemRecord.redeemedAt,
    orderReference: redeemRecord.orderReference,
    message: "Coupon redeemed successfully",
  });
});

const resendRedemptionOtp = catchAsync(async (req, res) => {
  const { redeemId } = req.body;

  if (!redeemId) {
    throw ApiError.badRequest("Redeem ID is required");
  }

  if (!isValidObjectId(redeemId)) {
    throw ApiError.badRequest("Invalid redeem ID");
  }

  const redeemRecord = await CouponRedeem.findOne({
    _id: redeemId,
    status: REDEEM_STATUS.ACTIVE,
  });

  if (!redeemRecord) {
    throw ApiError.notFound(
      "Redemption session not found or already completed",
    );
  }

  const coupon = await Coupon.findOne({
    _id: redeemRecord.couponId,
    userId: req.user!._id,
    isDeleted: false,
  });

  if (!coupon) {
    throw ApiError.forbidden("Unauthorized");
  }

  try {
    const otpCode = await redeemRecord.sendOTP();

    const customer = await User.findById(redeemRecord.userId).select(
      "email firstName",
    );
    if (customer?.email) {
      const { subject, html } = templates.couponOtp({
        firstName: customer.firstName,
        otpCode,
      });
      sendEmail({ to: customer.email, subject, html, type: "coupon_otp" });
    }

    return response.success(res, {
      redeemId: redeemRecord._id,
      message: "OTP resent successfully",
    });
  } catch (err: unknown) {
    if ((err as any).statusCode === 429) {
      return response.error(
        res,
        { code: "RATE_LIMIT_EXCEEDED", message: (err as Error).message },
        429,
        { waitSeconds: (err as any).waitSeconds },
      );
    }
    throw ApiError.badRequest((err as Error).message);
  }
});

const redeemLookupStages = [
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
      from: "couponpurchases",
      localField: "purchaseId",
      foreignField: "_id",
      pipeline: [{ $project: { "snapshot.title": 1, "snapshot.code": 1 } }],
      as: "purchase",
    },
  },
  { $addFields: { purchase: { $arrayElemAt: ["$purchase", 0] } } },
];

const redeemProjectStage = {
  $project: {
    redemptionCode: 1,
    redeemedQty: 1,
    redeemedAt: 1,
    orderReference: 1,
    couponTitle: "$purchase.snapshot.title",
    couponCode: "$purchase.snapshot.code",
    customer: { firstName: 1, lastName: 1 },
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

  const filter = {
    redeemedByUserId: toObjectId(req.user!._id),
    status: REDEEM_STATUS.REDEEMED,
  };

  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
  const skip = (pageNum - 1) * limitNum;
  const hasSearch = (search as string).trim().length > 0;

  const basePipeline: any[] = [{ $match: filter }];

  if (hasSearch) {
    const searchRegex = { $regex: (search as string).trim(), $options: "i" };
    basePipeline.push(...redeemLookupStages, {
      $match: {
        $or: [
          { "purchase.snapshot.title": searchRegex },
          { "purchase.snapshot.code": searchRegex },
          { redemptionCode: searchRegex },
          { "customer.firstName": searchRegex },
          { "customer.lastName": searchRegex },
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
      ...(!hasSearch ? redeemLookupStages : []),
      redeemProjectStage,
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
        redeemedByUserId: toObjectId(req.user!._id),
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

  if (!result) {
    throw ApiError.notFound("Redemption not found");
  }

  return response.success(res, { redemption: result });
});


export {
  create,
  list,
  getById,
  update,
  submit,
  deactivate,
  remove,
  verifyRedemptionCode,
  verifyRedemptionOtp,
  confirmRedemption,
  resendRedemptionOtp,
  couponRedemptions,
  couponRedemptionDetail,
};
