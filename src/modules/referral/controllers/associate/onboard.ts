import { randomInt } from 'node:crypto';
import ReferralCode from '@referral/models/ReferralCode';
import Referral from '@referral/models/Referral';
import User from '@user/models/User';
import { registerUser } from '@auth/index';
import catchAsync from '@utils/catchAsync';
import ApiError from '@utils/apiError';
import response from '@utils/response';
import { toObjectId } from '@utils/mongoHelper';
import { sendEmail } from '@notification/index';
import * as templates from '@referral/helpers/emailTemplates';
import type { OnboardListQuery, onboardSchema } from '@referral/validators';
import type { z } from 'zod';

type OnboardInput = z.infer<typeof onboardSchema>;

const list = catchAsync(async (req, res) => {
  const userId = toObjectId(req.user!._id);
  const { page, limit, status, sortBy, sortOrder } = req.query as unknown as OnboardListQuery;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = { referrerId: userId };
  if (status) filter.status = status;

  const [referrals, total] = await Promise.all([
    Referral.aggregate([
      { $match: filter },
      { $sort: { [sortBy]: sortOrder === "asc" ? 1 : -1 } },
      { $skip: skip },
      { $limit: limit },
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
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

const TEMP_PASSWORD_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

const registerOnboard = catchAsync(async (req, res) => {
  const { email, firstName, lastName, phone, role } = req.body as OnboardInput;

  const referralCodeRecord = await ReferralCode.findByUserId(req.user!._id);
  if (!referralCodeRecord) {
    throw ApiError.badRequest("No referral code found for your account", 'REFERRAL_CODE_NOT_FOUND');
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
