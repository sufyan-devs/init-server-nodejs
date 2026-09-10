import User from '@user/models/User';
import UserRole, { USER_ROLE_STATUS } from '@user/models/UserRole';
import catchAsync from '@utils/catchAsync';
import response from '@utils/response';

export const getProfile = catchAsync(async (req, res) => {
  const user = (await User.findById(req.user!._id).lean())!;
  const userRole = await UserRole.findOne({ userId: req.user!._id, status: USER_ROLE_STATUS.APPROVED })
    .populate('roleId', 'name code')
    .lean();

  return response.success(res, {
    user: {
      _id: user._id,
      email: user.email,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      phoneNumber: user.phone || '',
      dateOfBirth: user.dateOfBirth || null,
      profileImage: user.profileImage || null,
      role: userRole?.roleId || null,
      createdAt: user.createdAt,
    },
  });
});
