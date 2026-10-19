import User from '@user/models/User';
import { syncSessionUser } from '@auth/index';
import ApiError from '@utils/apiError';
import catchAsync from '@utils/catchAsync';
import response from '@utils/response';
import { formatFullName } from '@utils/format';
import { applyProfileFields } from '@user/helpers/profileFields';
import { updateImage, deleteImage } from '@user/helpers/image';

export const getProfile = catchAsync(async (req, res) => {
  const user = (await User.findById(req.user!._id).lean())!;

  return response.success(res, {
    user: {
      _id: user._id,
      email: user.email,
      fullName: formatFullName(user.firstName, user.lastName),
      phoneNumber: user.phone || '',
      dateOfBirth: user.dateOfBirth || null,
      profileImage: user.profileImage || null,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    },
  });
});

export const updateProfile = catchAsync(async (req, res) => {
  const { fullName, phoneNumber, dateOfBirth } = req.body;
  const user = (await User.findById(req.user!._id))!;

  applyProfileFields(user, { fullName, phoneNumber, dateOfBirth });

  await user.save();
  await syncSessionUser(String(user._id), user);

  return response.success(res, null, 200, 'Profile updated successfully.');
});

export const uploadImage = catchAsync(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest('No file uploaded.', 'NO_FILE');
  }

  const user = (await User.findById(req.user!._id))!;
  user.profileImage = await updateImage(req.file, user.profileImage);
  await user.save();
  await syncSessionUser(String(user._id), user);

  return response.success(res, { profileImage: user.profileImage }, 200, 'Profile image uploaded.');
});

export const deleteProfileImage = catchAsync(async (req, res) => {
  const user = (await User.findById(req.user!._id))!;

  if (!user.profileImage) {
    throw ApiError.badRequest('No profile image to delete.', 'NO_PROFILE_IMAGE');
  }

  await deleteImage(user.profileImage);
  user.profileImage = null;
  await user.save();
  await syncSessionUser(String(user._id), user);

  return response.success(res, null, 200, 'Profile image deleted.');
});
