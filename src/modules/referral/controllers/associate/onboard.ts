import { randomInt } from 'node:crypto';
import ReferralCode from '@referral/models/ReferralCode';
import Referral, { REFERRAL_STATUS } from '@referral/models/Referral';
import User from '@user/models/User';
import { ROLE_CODE } from '@user/models/Role';
import { registerUser } from '@auth/index';
import catchAsync from '@utils/catchAsync';
import ApiError from '@utils/apiError';
import response from '@utils/response';
import { toObjectId } from '@utils/mongoHelper';
import { sendEmail } from '@notification/index';
import * as templates from '@referral/helpers/emailTemplates';

const list = catchAsync(async (req, res) => {
  const userId = toObjectId(req.user!._id);
  const {
    page = 1,
    limit = 20,
    status,
    sortBy = "referredAt",
    sortOrder = "desc",
  } = req.query;

  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
  const skip = (pageNum - 1) * limitNum;

  const filter: any = { referrerId: userId };
  if (status && Object.values(REFERRAL_STATUS).includes(status as any)) {
    filter.status = status;
  }

  const [referrals, total] = await Promise.all([
    Referral.aggregate([
      { $match: filter },
      { $sort: { [sortBy as string]: sortOrder === "asc" ? 1 : -1 } },
      { $skip: skip },
      { $limit: limitNum },
      {
        $lookup: {
          from: "users",
          localField: "referredUserId",
          foreignField: "_id",
          pipeline: [{ $project: { firstName: 1, lastName: 1, createdAt: 1 } }],
          as: "user",
        },
      },
      { $addFields: { user: { $arrayElemAt: ["$user", 0] } } },
      {
        $project: {
          fullName: {
            $concat: [
              { $ifNull: ["$user.firstName", ""] },
              " ",
              { $ifNull: ["$user.lastName", ""] },
            ],
          },
          roleAppliedFor: 1,
          status: 1,
          registeredAt: { $ifNull: ["$user.createdAt", "$referredAt"] },
        },
      },
    ]),
    Referral.countDocuments(filter),
  ]);

  return response.success(res, {
    referrals,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

const TEMP_PASSWORD_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

const registerOnboard = catchAsync(async (req, res) => {
  const { email, firstName, lastName, phone, role } = req.body ?? {};

  if (![ROLE_CODE.VENDOR, ROLE_CODE.CUSTOMER].includes(role)) {
    throw ApiError.badRequest("Role must be VENDOR or CUSTOMER");
  }

  const referralCodeRecord = await ReferralCode.findByUserId(req.user!._id);
  if (!referralCodeRecord) {
    throw ApiError.badRequest("No referral code found for your account");
  }

  // register() is deliberately silent about duplicate emails, so it cannot
  // tell us whether the account was created. Without this check the invitee gets
  // a welcome email with credentials that were never set. Checking here is safe:
  // the caller is an authenticated associate, not an anonymous enumerator.
  const existing = await User.findByEmail(email);
  if (existing) {
    throw ApiError.conflict('That email already has an account.', 'EMAIL_ALREADY_EXISTS');
  }

  // A real emailed credential: randomInt for the same reason as generateOtp.
  const password = Array.from(
    { length: 12 },
    () => TEMP_PASSWORD_CHARS[randomInt(0, TEMP_PASSWORD_CHARS.length)],
  ).join("");

  await registerUser(
    {
      email,
      firstName,
      lastName,
      phone,
      roleCode: role,
      referralCode: referralCodeRecord.code,
      password,
    },
    { skipEmailVerification: true },
  );

  sendEmail({
    to: email,
    ...templates.welcomeCredentials({ firstName, email, password, role }),
    type: "welcomeCredentials",
  });

  return response.created(res, {
    message: `Account created. Credentials sent to ${email}`,
  });
});



export { list, registerOnboard };
