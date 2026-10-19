import { randomBytes } from 'node:crypto';
import User from '@user/models/User';
import Role, { ROLE_CODE } from '@user/models/Role';
import UserRole, { USER_ROLE_STATUS } from '@user/models/UserRole';
import ReferralCode from '@referral/models/ReferralCode';
import Referral, { REFERRAL_STATUS } from '@referral/models/Referral';
import sessionService, { toSessionUser } from '@auth/services/session.service';
import { verifyPassword, assertPasswordAllowed, dummyVerify, hashPassword } from '@auth/services/password.service';
import ApiError from '@utils/apiError';
import AuthErrors from '@constants/authErrors';
import { generateOTP, storeOTP, OTP_PURPOSE } from '@auth/helpers/otp';
import { sendEmail, templates } from '@notification/email';
import { record, AUDIT_ACTION, AUDIT_OUTCOME } from '@audit/index';
import { formatFullName } from '@utils/format';

interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  roleCode: string;
  referralCode?: string;
}

interface RegisterOptions {
  skipEmailVerification?: boolean;
}

interface LoginData {
  email: string;
  password: string;
  roleCode?: string;
}

interface LoginOptions {
  ipAddress?: string;
  userAgent?: string;
  deviceInfo?: string;
}

const register = async (data: RegisterData, options: RegisterOptions = {}) => {
  const {
    email,
    password,
    firstName,
    lastName,
    phone,
    roleCode,
    referralCode,
  } = data;
  const { skipEmailVerification = false } = options;

  const role = await Role.findByCode(roleCode);
  if (!role) throw ApiError.fromAuthError(400, AuthErrors.INVALID_ROLE_REQUEST);
  if (!role.canSelfRegister)
    throw ApiError.fromAuthError(403, AuthErrors.ROLE_NOT_AVAILABLE);

  await assertPasswordAllowed(password);

  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = await User.findByEmail(normalizedEmail);

  let referralCodeRecord: any = null;
  if (referralCode) {
    referralCodeRecord = await ReferralCode.findByCode(referralCode);
    if (!referralCodeRecord)
      throw ApiError.fromAuthError(400, AuthErrors.INVALID_REFERRAL_CODE);
  }

  const needsEmailVerification = !!role.emailVerificationRequired;
  const message = needsEmailVerification
    ? "Registration successful. Please verify your email to continue."
    : role.autoApproveOnSignup
      ? "Registration successful"
      : "Registration successful. Awaiting admin approval.";

  // The taken-email path must match a real signup in body and timing, or it confirms the address.
  if (existingUser) {
    await dummyVerify(password);

    sendEmail({
      to: normalizedEmail,
      subject: "Someone tried to register with your email",
      html: `<p>Hi ${existingUser.firstName},</p>
<p>Someone just tried to create an account with this email address. Your existing account is unchanged and no new account was created.</p>
<p>If this was you, sign in instead — or reset your password if you have forgotten it.</p>
<p>If it was not you, you can safely ignore this message.</p>`,
      type: "duplicate_registration",
    });

    return {
      user: {
        _id: randomBytes(12).toString("hex"),
        email: normalizedEmail,
        firstName,
        lastName,
        phone: phone || null,
        emailVerified: !needsEmailVerification,
        profileImage: null,
      },
      role: {
        code: roleCode,
        status: role.autoApproveOnSignup
          ? USER_ROLE_STATUS.APPROVED
          : USER_ROLE_STATUS.PENDING,
      },
      requiresEmailVerification: needsEmailVerification,
      message,
    };
  }

  const user = await User.create({
    email,
    passwordHash: await hashPassword(password),
    firstName,
    lastName,
    phone,
    emailVerified: !needsEmailVerification,
  });

  const userRole = await UserRole.assignRole(user._id, roleCode, {
    requestedBy: user._id,
    autoApprove: role.autoApproveOnSignup,
    approvedBy: role.autoApproveOnSignup ? user._id : undefined,
  });

  if (referralCodeRecord) {
    await Referral.create({
      referrerId: referralCodeRecord.userId,
      referredUserId: user._id,
      referralCodeId: referralCodeRecord._id,
      codeUsed: referralCodeRecord.code,
      roleAppliedFor: roleCode,
      status: role.autoApproveOnSignup
        ? REFERRAL_STATUS.ACTIVE
        : REFERRAL_STATUS.PENDING,
      activatedAt: role.autoApproveOnSignup ? new Date() : null,
    });
    await referralCodeRecord.incrementUsage(role.autoApproveOnSignup);
  }

  if ((roleCode === ROLE_CODE.BUSINESS_ASSOCIATE || roleCode === ROLE_CODE.VENDOR) && role.autoApproveOnSignup) {
    await ReferralCode.createForUser(user._id);
  }

  if (needsEmailVerification && !skipEmailVerification) {
    const otp = generateOTP();
    await storeOTP(normalizedEmail, otp, OTP_PURPOSE.VERIFY_EMAIL);
    const tpl = templates.emailVerificationOtp({
      firstName: formatFullName(firstName, lastName),
      otpCode: otp,
    });
    sendEmail({
      to: email,
      subject: tpl.subject,
      html: tpl.html,
      type: "email_verification",
    });
  }

  return {
    user: user.toAuthJSON(),
    role: { code: roleCode, status: userRole.status },
    requiresEmailVerification: needsEmailVerification,
    message,
  };
};

const login = async (data: LoginData, options: LoginOptions = {}) => {
  const { email, password, roleCode } = data;
  const { ipAddress, userAgent, deviceInfo } = options;

  const user = await verifyPassword(email, password);

  if (roleCode !== ROLE_CODE.CUSTOMER && !user.emailVerified) {
    const targetRole = await Role.findByCode(roleCode!);
    if (targetRole && targetRole.emailVerificationRequired) {
      return { requiresEmailVerification: true, email: user.email };
    }
  }

  const userRoles = await UserRole.getUserRoleCodes(user._id);
  if (userRoles.length === 0)
    throw ApiError.fromAuthError(403, AuthErrors.ACCOUNT_NOT_APPROVED);

  const activeRole = roleCode || userRoles[0];
  if (roleCode && !userRoles.includes(roleCode)) {
    throw ApiError.fromAuthError(403, AuthErrors.PORTAL_ACCESS_DENIED);
  }

  const session = await sessionService.createSession({
    userId: String(user._id),
    user: toSessionUser(user),
    activeRole,
    availableRoles: userRoles,
    portal: roleCode || activeRole,
    ipAddress,
    userAgent,
    deviceInfo,
  });

  void record({
    actorId: String(user._id),
    action: AUDIT_ACTION.LOGIN_SUCCESS,
    outcome: AUDIT_OUTCOME.SUCCESS,
    meta: { activeRole, portal: roleCode || activeRole },
    ip: ipAddress,
    userAgent,
  });

  return {
    user: { ...user.toAuthJSON(), activeRole },
    token: session.token,
    sid: session.sid,
  };
};

const logoutAllSessions = async (userId: any) => {
  await sessionService.revokeAllSessions(String(userId));
  void record({
    actorId: String(userId),
    action: AUDIT_ACTION.LOGOUT_ALL,
    outcome: AUDIT_OUTCOME.SUCCESS,
  });
  return { message: "All sessions logged out" };
};

const switchRole = async (sid: string, newRole: string, availableRoles: string[]) => {
  const updated = await sessionService.switchActiveRole(sid, newRole, availableRoles);
  return { activeRole: updated.activeRole };
};

const getAvailableRoles = async (userId: any) => {
  const userRoles = await UserRole.getUserActiveRoles(userId);
  return userRoles.map((ur: any) => ({
    code: ur.roleCode,
    name: ur.roleId.name,
    status: ur.status,
  }));
};

const getReferralCode = async (userId: any) => {
  const referralCode = await ReferralCode.findByUserId(userId);
  if (!referralCode)
    throw ApiError.notFound("No referral code found for your account.");
  return {
    code: referralCode.code,
    totalUsed: referralCode.totalUsed,
    successfulReferrals: referralCode.successfulReferrals,
    createdAt: referralCode.createdAt,
  };
};

const requestRole = async (userId: any, roleCode: string, referralCode: string | null = null) => {
  const role = await Role.findByCode(roleCode);
  if (!role) throw ApiError.fromAuthError(400, AuthErrors.INVALID_ROLE_REQUEST);
  if (!role.canSelfRegister)
    throw ApiError.fromAuthError(403, AuthErrors.ROLE_NOT_AVAILABLE);

  const existingRole = await UserRole.findOne({ userId, roleCode });
  if (existingRole)
    throw ApiError.fromAuthError(409, AuthErrors.ROLE_ALREADY_EXISTS);

  let referralCodeRecord: any = null;
  if (referralCode) {
    referralCodeRecord = await ReferralCode.findByCode(referralCode);
    if (!referralCodeRecord)
      throw ApiError.fromAuthError(400, AuthErrors.INVALID_REFERRAL_CODE);
  }

  const userRole = await UserRole.assignRole(userId, roleCode, {
    requestedBy: userId,
  });

  if (referralCodeRecord) {
    await Referral.create({
      referrerId: referralCodeRecord.userId,
      referredUserId: userId,
      referralCodeId: referralCodeRecord._id,
      codeUsed: referralCodeRecord.code,
      roleAppliedFor: roleCode,
    });
    await referralCodeRecord.incrementUsage();
  }

  return {
    role: { code: roleCode, status: userRole.status },
    message: "Request submitted. Awaiting admin approval.",
  };
};

export {
  register,
  login,
  logoutAllSessions,
  switchRole,
  getAvailableRoles,
  getReferralCode,
  requestRole,
};
