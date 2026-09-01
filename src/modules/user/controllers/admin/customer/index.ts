import { hashPassword, revokeUserSessions, syncSessionUser } from '@auth/index';
import User, { USER_STATUS } from '@user/models/User';
import UserRole, { USER_ROLE_STATUS } from '@user/models/UserRole';
import { ROLE_CODE } from '@user/models/Role';
import catchAsync from '@utils/catchAsync';
import ApiError from '@utils/apiError';
import response from '@utils/response';
import { isValidObjectId } from '@utils/mongoHelper';
import { saveImage, updateImage, deleteImage } from '@user/helpers/image';

export const list = catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search = "",
    isActive,
    isVerified,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
  const skip = (pageNum - 1) * limitNum;

  const userMatch: Record<string, unknown> = {};
  if (isActive)
    userMatch.status =
      isActive === "true" ? USER_STATUS.ACTIVE : USER_STATUS.SUSPENDED;
  if (isVerified) userMatch.emailVerified = isVerified === "true";

  const lookupSubPipeline: Record<string, unknown>[] = [];
  if (Object.keys(userMatch).length)
    lookupSubPipeline.push({ $match: userMatch });
  lookupSubPipeline.push({
    $project: {
      firstName: 1,
      lastName: 1,
      email: 1,
      phone: 1,
      profileImage: 1,
      emailVerified: 1,
      status: 1,
      createdAt: 1,
    },
  });

  const pipeline: Record<string, unknown>[] = [
    {
      $match: {
        roleCode: ROLE_CODE.CUSTOMER,
        status: USER_ROLE_STATUS.APPROVED,
        isActive: true,
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        pipeline: lookupSubPipeline,
        as: "user",
      },
    },
    { $unwind: "$user" },
    {
      $addFields: {
        fullName: {
          $trim: {
            input: { $concat: ["$user.firstName", " ", "$user.lastName"] },
          },
        },
        email: "$user.email",
        phoneNumber: { $ifNull: ["$user.phone", ""] },
      },
    },
  ];

  if ((search as string).trim()) {
    const searchRegex = { $regex: (search as string).trim(), $options: "i" };
    pipeline.push({
      $match: {
        $or: [
          { fullName: searchRegex },
          { email: searchRegex },
          { phoneNumber: searchRegex },
        ],
      },
    });
  }

  const countPipeline = [...pipeline, { $count: "total" }];

  pipeline.push(
    {
      $sort: {
        [sortBy === "fullName" ? "fullName" : `user.${sortBy}`]:
          sortOrder === "asc" ? 1 : -1,
      },
    },
    { $skip: skip },
    { $limit: limitNum },
    {
      $project: {
        _id: "$userId",
        fullName: 1,
        email: 1,
        phoneNumber: 1,
        profileImage: { $ifNull: ["$user.profileImage", null] },
        isVerified: "$user.emailVerified",
        isActive: { $eq: ["$user.status", USER_STATUS.ACTIVE] },
        createdAt: "$user.createdAt",
      },
    },
  );

  const [customers, countResult] = await Promise.all([
    UserRole.aggregate(pipeline as any[]),
    UserRole.aggregate(countPipeline as any[]),
  ]);

  const total = countResult[0]?.total || 0;

  return response.success(res, {
    customers,
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

export const getById = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid customer ID");
  }

  const userRole = await UserRole.findOne({
    userId: id,
    roleCode: ROLE_CODE.CUSTOMER,
  }).lean();

  if (!userRole) {
    throw ApiError.notFound("Customer not found");
  }

  const user = await User.findById(id)
    .select(
      "firstName lastName email phone profileImage emailVerified dateOfBirth status createdAt",
    )
    .lean();

  if (!user) {
    throw ApiError.notFound("Customer not found");
  }

  return response.success(res, {
    customer: {
      _id: user._id,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      email: user.email,
      phoneNumber: user.phone || "",
      profileImage: user.profileImage || null,
      isVerified: user.emailVerified,
      isActive: user.status === USER_STATUS.ACTIVE,
      dateOfBirth: user.dateOfBirth || null,
      createdAt: user.createdAt,
      role: { name: "Customer" },
    },
  });
});

export const create = catchAsync(async (req, res) => {
  const { fullName, email, password, phoneNumber } = req.body;

  if (!fullName || !email || !password) {
    throw ApiError.badRequest("Full name, email, and password are required");
  }

  const existing = await User.findByEmail(email);
  if (existing) {
    throw ApiError.conflict("A user with this email already exists");
  }

  const nameParts = fullName.trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(" ") || nameParts[0];

  let profileImage = null;
  if (req.file) {
    profileImage = await saveImage(req.file, "profiles");
  }

  const user = await User.create({
    firstName,
    lastName,
    email: email.toLowerCase().trim(),
    passwordHash: await hashPassword(password),
    phone: phoneNumber || undefined,
    emailVerified: true,
    profileImage,
  });

  await UserRole.assignRole(user._id, ROLE_CODE.CUSTOMER, {
    autoApprove: true,
    approvedBy: req.user!._id,
  });

  return response.created(
    res,
    {
      customer: {
        _id: user._id,
        fullName: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
      },
    },
    "Customer created successfully",
  );
});

export const update = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid customer ID");
  }

  const userRole = await UserRole.findOne({
    userId: id,
    roleCode: ROLE_CODE.CUSTOMER,
  });

  if (!userRole) {
    throw ApiError.notFound("Customer not found");
  }

  const user = await User.findById(id);
  if (!user) {
    throw ApiError.notFound("Customer not found");
  }

  const { fullName, phoneNumber, dateOfBirth } = req.body;

  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    user.firstName = parts[0];
    user.lastName = parts.slice(1).join(" ") || parts[0];
  }

  if (phoneNumber !== undefined) {
    if (phoneNumber !== user.phone) {
      user.phone = phoneNumber || undefined;
      user.phoneVerified = false;
    }
  }

  if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth || null;

  await user.save();
  await syncSessionUser(String(user._id), user);

  return response.success(res, null, 200, "Customer updated successfully");
});

export const toggleStatus = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid customer ID");
  }

  const userRole = await UserRole.findOne({
    userId: id,
    roleCode: ROLE_CODE.CUSTOMER,
  });

  if (!userRole) {
    throw ApiError.notFound("Customer not found");
  }

  const user = await User.findById(id);
  if (!user) {
    throw ApiError.notFound("Customer not found");
  }

  const nextStatus =
    user.status === USER_STATUS.ACTIVE
      ? USER_STATUS.SUSPENDED
      : USER_STATUS.ACTIVE;

  // Revoke before persisting. If Redis fails the account is still ACTIVE with its
  // sessions gone - a harmless re-login. The other order leaves a suspended user
  // holding live sessions, and authenticate() no longer re-reads their status.
  if (nextStatus !== USER_STATUS.ACTIVE) {
    await revokeUserSessions(String(user._id));
  }

  user.status = nextStatus;
  await user.save();

  return response.success(
    res,
    { isActive: user.status === USER_STATUS.ACTIVE },
    200,
    `Customer ${user.status === USER_STATUS.ACTIVE ? "activated" : "deactivated"} successfully`,
  );
});

export const uploadProfileImage = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid customer ID");
  }

  if (!req.file) {
    return response.error(res, "No file uploaded.", 400);
  }

  const user = await User.findById(id);
  if (!user) {
    throw ApiError.notFound("Customer not found");
  }

  user.profileImage = await updateImage(
    req.file,
    user.profileImage,
    "profiles",
  );
  await user.save();
  await syncSessionUser(String(user._id), user);

  return response.success(
    res,
    { profileImage: user.profileImage },
    200,
    "Profile image uploaded.",
  );
});

export const deleteProfileImage = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid customer ID");
  }

  const user = await User.findById(id);
  if (!user) {
    throw ApiError.notFound("Customer not found");
  }

  if (!user.profileImage) {
    return response.error(res, "No profile image to delete.", 400);
  }

  await deleteImage(user.profileImage);
  user.profileImage = null;
  await user.save();
  await syncSessionUser(String(user._id), user);

  return response.success(res, null, 200, "Profile image deleted.");
});

