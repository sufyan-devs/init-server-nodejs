import type { Request } from 'express';
import type { PipelineStage } from 'mongoose';
import { assertPasswordAllowed, hashPassword, revokeUserSessions, syncSessionUser, runRoleApprovedHook } from '@auth/index';
import { record, AUDIT_ACTION, AUDIT_OUTCOME, type AuditAction } from '@audit/index';
import User, { USER_STATUS } from '@user/models/User';
import UserRole, { USER_ROLE_STATUS } from '@user/models/UserRole';
import type { RoleCode } from '@user/models/Role';
import catchAsync from '@utils/catchAsync';
import ApiError from '@utils/apiError';
import response from '@utils/response';
import { escapeRegex } from '@utils/format';
import { saveImage, updateImage, deleteImage } from '@user/helpers/image';
import { applyProfileFields, splitFullName } from '@user/helpers/profileFields';
import type { ManagedUserListQuery } from '@user/validators';

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

  const findManagedUser = async (req: Request) => {
    const { id } = req.params;
    const userRole = await UserRole.exists({ userId: id, roleCode });
    if (!userRole) throw ApiError.notFound(NOT_FOUND_MESSAGE, 'USER_NOT_FOUND');

    const user = await User.findOne({ _id: id, status: { $ne: USER_STATUS.DELETED } });
    if (!user) throw ApiError.notFound(NOT_FOUND_MESSAGE, 'USER_NOT_FOUND');
    return user;
  };

  const recordUserAction = (req: Request, action: AuditAction, userId: string, meta?: Record<string, unknown>) => {
    void record({
      actorId: String(req.user!._id),
      action,
      outcome: AUDIT_OUTCOME.SUCCESS,
      resource: 'user',
      resourceId: userId,
      meta: { roleCode, ...meta },
      ip: req.ip ?? '',
      userAgent: req.get('User-Agent'),
    });
  };

  const list = catchAsync(async (req, res) => {
    const { page, limit, search, isActive, isVerified, sortBy, sortOrder } =
      req.query as unknown as ManagedUserListQuery;
    const skip = (page - 1) * limit;

    const userMatch: Record<string, unknown> = {};
    if (isActive !== undefined) {
      userMatch.status = isActive ? USER_STATUS.ACTIVE : USER_STATUS.SUSPENDED;
    }
    if (isVerified !== undefined) userMatch.emailVerified = isVerified;

    const lookupSubPipeline: PipelineStage.Lookup['$lookup']['pipeline'] = [];
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

    const pipeline: PipelineStage[] = [
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

    if (search) {
      const searchRegex = { $regex: escapeRegex(search), $options: 'i' };
      pipeline.push({
        $match: {
          $or: [{ fullName: searchRegex }, { email: searchRegex }, { phoneNumber: searchRegex }],
        },
      });
    }

    const countPipeline: PipelineStage[] = [...pipeline, { $count: 'total' }];

    pipeline.push(
      {
        $sort: {
          [sortBy === 'fullName' ? 'fullName' : `user.${sortBy}`]: sortOrder === 'asc' ? 1 : -1,
        },
      },
      { $skip: skip },
      { $limit: limit },
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
      UserRole.aggregate(pipeline),
      UserRole.aggregate<{ total: number }>(countPipeline),
    ]);

    const total = countResult[0]?.total ?? 0;

    return response.success(res, {
      [listKey]: items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  });

  const getById = catchAsync(async (req, res) => {
    const user = await findManagedUser(req);

    return response.success(res, {
      [itemKey]: {
        _id: user._id,
        fullName: user.fullName,
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
      throw ApiError.conflict('A user with this email already exists', 'EMAIL_EXISTS');
    }

    await assertPasswordAllowed(password);
    const { firstName, lastName } = splitFullName(fullName);

    const user = await User.create({
      firstName,
      lastName,
      email,
      passwordHash: await hashPassword(password),
      phone: phoneNumber || undefined,
      emailVerified: true,
    });

    await UserRole.assignRole(user._id, roleCode, {
      autoApprove: true,
      approvedBy: req.user!._id,
    });
    await runRoleApprovedHook({ userId: user._id, roleCode });

    // Saved last: an earlier failure would otherwise leave an orphan file on disk.
    if (req.file) {
      user.profileImage = await saveImage(req.file);
      await user.save();
    }

    recordUserAction(req, AUDIT_ACTION.USER_CREATED, String(user._id));

    return response.created(
      res,
      {
        [itemKey]: {
          _id: user._id,
          fullName: user.fullName,
          email: user.email,
        },
      },
      `${title} created successfully`,
    );
  });

  const update = catchAsync(async (req, res) => {
    const user = await findManagedUser(req);

    const { fullName, phoneNumber, dateOfBirth } = req.body;

    applyProfileFields(user, { fullName, phoneNumber, dateOfBirth });

    await user.save();
    await syncSessionUser(String(user._id), user);
    recordUserAction(req, AUDIT_ACTION.USER_UPDATED, String(user._id), { fields: Object.keys(req.body) });

    return response.success(res, null, 200, `${title} updated successfully`);
  });

  const toggleStatus = catchAsync(async (req, res) => {
    const user = await findManagedUser(req);

    const nextStatus =
      user.status === USER_STATUS.ACTIVE ? USER_STATUS.SUSPENDED : USER_STATUS.ACTIVE;

    // Before persisting: a Redis failure then leaves an ACTIVE account with no sessions
    // (a harmless re-login) rather than a suspended one that still has them.
    if (nextStatus !== USER_STATUS.ACTIVE) {
      await revokeUserSessions(String(user._id));
    }

    user.status = nextStatus;
    await user.save();
    recordUserAction(req, AUDIT_ACTION.USER_STATUS_CHANGED, String(user._id), { status: nextStatus });

    return response.success(
      res,
      { isActive: user.status === USER_STATUS.ACTIVE },
      200,
      `${title} ${user.status === USER_STATUS.ACTIVE ? 'activated' : 'deactivated'} successfully`,
    );
  });

  const uploadProfileImage = catchAsync(async (req, res) => {
    if (!req.file) {
      throw ApiError.badRequest('No file uploaded.', 'NO_FILE');
    }

    const user = await findManagedUser(req);

    user.profileImage = await updateImage(req.file, user.profileImage);
    await user.save();
    await syncSessionUser(String(user._id), user);
    recordUserAction(req, AUDIT_ACTION.USER_IMAGE_CHANGED, String(user._id), { change: 'uploaded' });

    return response.success(res, { profileImage: user.profileImage }, 200, 'Profile image uploaded.');
  });

  const deleteProfileImage = catchAsync(async (req, res) => {
    const user = await findManagedUser(req);

    if (!user.profileImage) {
      throw ApiError.badRequest('No profile image to delete.', 'NO_PROFILE_IMAGE');
    }

    await deleteImage(user.profileImage);
    user.profileImage = null;
    await user.save();
    await syncSessionUser(String(user._id), user);
    recordUserAction(req, AUDIT_ACTION.USER_IMAGE_CHANGED, String(user._id), { change: 'deleted' });

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
export type { ManagedUserLabels };
