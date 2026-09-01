import User from '@user/models/User';
import { syncSessionUser } from '@auth/index';
import UserRole from '@user/models/UserRole';
import catchAsync from '@utils/catchAsync';
import response from '@utils/response';
import { updateImage, deleteImage } from '@user/helpers/image';

export const getProfile = catchAsync(async (req, res) => {
  const user = (await User.findById(req.user!._id).lean())!;
  const userRole = await UserRole.findOne({ userId: req.user!._id, status: 'APPROVED' })
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

export const updateProfile = catchAsync(async (req, res) => {
  const { fullName, phoneNumber, dateOfBirth } = req.body;
  const user = (await User.findById(req.user!._id))!;

  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    user.firstName = parts[0];
    user.lastName = parts.slice(1).join(' ') || parts[0];
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

  return response.success(res, null, 200, 'Profile updated successfully.');
});

export const uploadImage = catchAsync(async (req, res) => {
  if (!req.file) {
    return response.error(res, 'No file uploaded.', 400);
  }

  const user = (await User.findById(req.user!._id))!;
  user.profileImage = await updateImage(req.file, user.profileImage, 'profiles');
  await user.save();
  await syncSessionUser(String(user._id), user);

  return response.success(res, { profileImage: user.profileImage }, 200, 'Profile image uploaded.');
});

export const deleteProfileImage = catchAsync(async (req, res) => {
  const user = (await User.findById(req.user!._id))!;

  if (!user.profileImage) {
    return response.error(res, 'No profile image to delete.', 400);
  }

  await deleteImage(user.profileImage);
  user.profileImage = null;
  await user.save();
  await syncSessionUser(String(user._id), user);

  return response.success(res, null, 200, 'Profile image deleted.');
});

