import User from '@user/models/User';
import UserRole, { USER_ROLE_STATUS } from '@user/models/UserRole';
import ApiError from '@utils/apiError';
import catchAsync from '@utils/catchAsync';
import response from '@utils/response';
import { formatFullName } from '@utils/format';

export const getProfile = catchAsync(async (req, res) => {
  const user = await User.findById(req.user!._id).lean();
  if (!user) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');

  const userRole = await UserRole.findOne({
    userId: req.user!._id,
    roleCode: req.user!.activeRole,
    status: USER_ROLE_STATUS.APPROVED,
    isActive: true,
  })
    .populate('roleId', 'name code')
    .lean();

  return response.success(res, {
    user: {
      _id: user._id,
      email: user.email,
      fullName: formatFullName(user.firstName, user.lastName),
      phoneNumber: user.phone || '',
      dateOfBirth: user.dateOfBirth || null,
      profileImage: user.profileImage || null,
      role: userRole?.roleId || null,
      createdAt: user.createdAt,
    },
  });
});
