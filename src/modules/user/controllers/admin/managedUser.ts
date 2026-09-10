import { hashPassword, revokeUserSessions, syncSessionUser } from '@auth/index';
import User, { USER_STATUS } from '@user/models/User';
import UserRole, { USER_ROLE_STATUS } from '@user/models/UserRole';
import type { RoleCode } from '@user/models/Role';
import catchAsync from '@utils/catchAsync';
import ApiError from '@utils/apiError';
import response from '@utils/response';
import { saveImage, updateImage, deleteImage } from '@user/helpers/image';
import { applyProfileFields, splitFullName } from '@user/helpers/profileFields';

interface ManagedUserLabels {
  itemKey: string;
  listKey: string;
  title: string;
  roleName: string;
}

const makeManagedUserController = (
  roleCode: RoleCode,
  { itemKey, listKey, title, roleName }: ManagedUserLabels,
) => {
  const NOT_FOUND_MESSAGE = `${title} not found`;

  const list = catchAsync(async (req, res) => {
    const {
      page = 1,
      limit,
      search = '',
      isActive,
      isVerified,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    // Both are numbers by the time they arrive: managedUserListQuerySchema coerces them.
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    const userMatch: Record<string, unknown> = {};
    if (isActive !== undefined) {
      userMatch.status = isActive === 'true' ? USER_STATUS.ACTIVE : USER_STATUS.SUSPENDED;
    }
    if (isVerified !== undefined) userMatch.emailVerified = isVerified === 'true';

    const lookupSubPipeline: Record<string, unknown>[] = [];
    if (Object.keys(userMatch).length) lookupSubPipeline.push({ $match: userMatch });
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
          roleCode,
          status: USER_ROLE_STATUS.APPROVED,
          isActive: true,
        },
      },
      {
        $lookup: {
          from: User.collection.name,
          localField: 'userId',
          foreignField: '_id',
          pipeline: lookupSubPipeline,
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $addFields: {
          fullName: {
            $trim: {
              input: { $concat: ['$user.firstName', ' ', '$user.lastName'] },
            },
          },
          email: '$user.email',
          phoneNumber: { $ifNull: ['$user.phone', ''] },
        },
      },
    ];

    if ((search as string).trim()) {
      const searchRegex = { $regex: (search as string).trim(), $options: 'i' };
      pipeline.push({
        $match: {
          $or: [{ fullName: searchRegex }, { email: searchRegex }, { phoneNumber: searchRegex }],
        },
      });
    }

    const countPipeline = [...pipeline, { $count: 'total' }];

    pipeline.push(
      {
        $sort: {
          [sortBy === 'fullName' ? 'fullName' : `user.${sortBy}`]: sortOrder === 'asc' ? 1 : -1,
        },
      },
      { $skip: skip },
      { $limit: limitNum },
      {
        $project: {
          _id: '$userId',
          fullName: 1,
          email: 1,
          phoneNumber: 1,
          profileImage: { $ifNull: ['$user.profileImage', null] },
          isVerified: '$user.emailVerified',
          isActive: { $eq: ['$user.status', USER_STATUS.ACTIVE] },
          createdAt: '$user.createdAt',
        },
      },
    );

    const [items, countResult] = await Promise.all([
      UserRole.aggregate(pipeline as any[]),
      UserRole.aggregate(countPipeline as any[]),
    ]);

    const total = countResult[0]?.total ?? 0;

    return response.success(res, {
      [listKey]: items,
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

    const userRole = await UserRole.findOne({ userId: id, roleCode }).lean();

    if (!userRole) {
      throw ApiError.notFound(NOT_FOUND_MESSAGE);
    }

    const user = await User.findById(id)
      .select('firstName lastName email phone profileImage emailVerified dateOfBirth status createdAt')
      .lean();

    if (!user) {
      throw ApiError.notFound(NOT_FOUND_MESSAGE);
    }

    return response.success(res, {
      [itemKey]: {
        _id: user._id,
        fullName: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        phoneNumber: user.phone || '',
        profileImage: user.profileImage || null,
        isVerified: user.emailVerified,
        isActive: user.status === USER_STATUS.ACTIVE,
        dateOfBirth: user.dateOfBirth || null,
        createdAt: user.createdAt,
        role: { name: roleName },
      },
    });
  });

  const create = catchAsync(async (req, res) => {
    const { fullName, email, password, phoneNumber } = req.body;

    const existing = await User.findByEmail(email);
    if (existing) {
      throw ApiError.conflict('A user with this email already exists');
    }

    const { firstName, lastName } = splitFullName(fullName);

    let profileImage = null;
    if (req.file) {
      profileImage = await saveImage(req.file, 'profiles');
    }

    const user = await User.create({
      firstName,
      lastName,
      email,
      passwordHash: await hashPassword(password),
      phone: phoneNumber || undefined,
      emailVerified: true,
      profileImage,
    });

    await UserRole.assignRole(user._id, roleCode, {
      autoApprove: true,
      approvedBy: req.user!._id,
    });

    return response.created(
      res,
      {
        [itemKey]: {
          _id: user._id,
          fullName: `${user.firstName} ${user.lastName}`.trim(),
          email: user.email,
        },
      },
      `${title} created successfully`,
    );
  });

  const update = catchAsync(async (req, res) => {
    const { id } = req.params;

    const userRole = await UserRole.findOne({ userId: id, roleCode });

    if (!userRole) {
      throw ApiError.notFound(NOT_FOUND_MESSAGE);
    }

    const user = await User.findById(id);
    if (!user) {
      throw ApiError.notFound(NOT_FOUND_MESSAGE);
    }

    const { fullName, phoneNumber, dateOfBirth } = req.body;

    applyProfileFields(user, { fullName, phoneNumber, dateOfBirth });

    await user.save();
    await syncSessionUser(String(user._id), user);

    return response.success(res, null, 200, `${title} updated successfully`);
  });

  const toggleStatus = catchAsync(async (req, res) => {
    const { id } = req.params;

    const userRole = await UserRole.findOne({ userId: id, roleCode });

    if (!userRole) {
      throw ApiError.notFound(NOT_FOUND_MESSAGE);
    }

    const user = await User.findById(id);
    if (!user) {
      throw ApiError.notFound(NOT_FOUND_MESSAGE);
    }

    const nextStatus =
      user.status === USER_STATUS.ACTIVE ? USER_STATUS.SUSPENDED : USER_STATUS.ACTIVE;

    // Before persisting: a Redis failure then leaves an ACTIVE account with no sessions
    // (a harmless re-login) rather than a suspended one that still has them.
    if (nextStatus !== USER_STATUS.ACTIVE) {
      await revokeUserSessions(String(user._id));
    }

    user.status = nextStatus;
    await user.save();

    return response.success(
      res,
      { isActive: user.status === USER_STATUS.ACTIVE },
      200,
      `${title} ${user.status === USER_STATUS.ACTIVE ? 'activated' : 'deactivated'} successfully`,
    );
  });

  const uploadProfileImage = catchAsync(async (req, res) => {
    const { id } = req.params;

    if (!req.file) {
      throw ApiError.badRequest('No file uploaded.', 'NO_FILE');
    }

    const user = await User.findById(id);
    if (!user) {
      throw ApiError.notFound(NOT_FOUND_MESSAGE);
    }

    user.profileImage = await updateImage(req.file, user.profileImage, 'profiles');
    await user.save();
    await syncSessionUser(String(user._id), user);

    return response.success(res, { profileImage: user.profileImage }, 200, 'Profile image uploaded.');
  });

  const deleteProfileImage = catchAsync(async (req, res) => {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      throw ApiError.notFound(NOT_FOUND_MESSAGE);
    }

    if (!user.profileImage) {
      return response.error(res, 'No profile image to delete.', 400);
    }

    await deleteImage(user.profileImage);
    user.profileImage = null;
    await user.save();
    await syncSessionUser(String(user._id), user);

    return response.success(res, null, 200, 'Profile image deleted.');
  });

  return {
    list,
    getById,
    create,
    update,
    toggleStatus,
    uploadProfileImage,
    deleteProfileImage,
  };
};

export { makeManagedUserController };
