import { randomBytes } from 'node:crypto';
import User from '@user/models/User';
import Role from '@user/models/Role';
import UserRole, { USER_ROLE_STATUS } from '@user/models/UserRole';
import sessionService, { toSessionUser } from '@auth/services/session.service';
import { verifyPassword, assertPasswordAllowed, dummyVerify, hashPassword } from '@auth/services/password.service';
import ApiError from '@utils/apiError';
import AUTH_ERRORS from '@constants/authErrors';
import { generateOtp, storeOtp, OTP_PURPOSE } from '@auth/helpers/otp';
import { sendEmail, templates } from '@notification/index';
import { record, AUDIT_ACTION, AUDIT_OUTCOME } from '@audit/index';
import { escapeHtml, formatFullName, normalizeEmail } from '@utils/format';
import { runSignupHook, runRoleApprovedHook } from '@auth/signupHooks';
import { toObjectId } from '@utils/mongoHelper';
import { portalOf } from '@utils/cookieHelper';

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
  roleCode: string;
}

interface LoginOptions {
  ipAddress?: string;
  userAgent?: string;
  deviceInfo?: string;
}

const registrationMessage = (needsEmailVerification: boolean, autoApproved: boolean): string => {
  if (needsEmailVerification) return "Registration successful. Please verify your email to continue.";
  if (autoApproved) return "Registration successful";
  return "Registration successful. Awaiting admin approval.";
};

const register = async (data: RegisterData, options: RegisterOptions = {}) => {
  const {
    password,
    firstName,
    lastName,
    phone,
    roleCode,
    referralCode,
  } = data;
  const { skipEmailVerification = false } = options;

  const role = await Role.findByCode(roleCode);
  if (!role) throw ApiError.fromAuthError(AUTH_ERRORS.INVALID_ROLE_REQUEST);
  if (!role.canSelfRegister)
    throw ApiError.fromAuthError(AUTH_ERRORS.ROLE_NOT_AVAILABLE);

  await assertPasswordAllowed(password);

  // Kept although the validator normalises: the referral onboard caller passes a raw body.
  const email = normalizeEmail(data.email);
  const existingUser = await User.findByEmail(email);

  const afterSignup = await runSignupHook({ roleCode, referralCode });

  const needsEmailVerification = !!role.emailVerificationRequired;
  const message = registrationMessage(needsEmailVerification, role.autoApproveOnSignup);

  // The taken-email path must match a real signup in body and timing, or it confirms the address.
  if (existingUser) {
    await dummyVerify(password);

    sendEmail({
      to: email,
      subject: "Someone tried to register with your email",
      html: `<p>Hi ${escapeHtml(existingUser.firstName)},</p>
<p>Someone just tried to create an account with this email address. Your existing account is unchanged and no new account was created.</p>
<p>If this was you, sign in instead — or reset your password if you have forgotten it.</p>
<p>If it was not you, you can safely ignore this message.</p>`,
      type: "duplicate_registration",
    });

    return {
      user: {
        _id: randomBytes(12).toString("hex"),
        email,
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

  await afterSignup?.({ userId: user._id });
  if (userRole.status === USER_ROLE_STATUS.APPROVED) {
    await runRoleApprovedHook({ userId: user._id, roleCode });
  }

  void record({
    actorId: String(user._id),
    action: AUDIT_ACTION.REGISTER,
    outcome: AUDIT_OUTCOME.SUCCESS,
    meta: { roleCode, status: userRole.status },
  });

  if (needsEmailVerification && !skipEmailVerification) {
    const otp = generateOtp();
    await storeOtp(email, otp, OTP_PURPOSE.VERIFY_EMAIL);
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

// A portal admits any role that maps to it (SUPER_ADMIN and ADMIN share the admin
// portal); the role the portal was asked for wins when the user holds it.
const pickPortalRole = (userRoles: string[], roleCode: string): string | undefined =>
  userRoles.includes(roleCode)
    ? roleCode
    : userRoles.find((code) => portalOf(code) === portalOf(roleCode));

const login = async (data: LoginData, options: LoginOptions = {}) => {
  const { email, password, roleCode } = data;
  const { ipAddress, userAgent, deviceInfo } = options;

  const user = await verifyPassword(email, password);

  if (!user.emailVerified) {
    const targetRole = await Role.findByCode(roleCode);
    if (targetRole?.emailVerificationRequired) {
      return { requiresEmailVerification: true, email: user.email };
    }
  }

  const userRoles = await UserRole.getUserRoleCodes(user._id);
  if (userRoles.length === 0)
    throw ApiError.fromAuthError(AUTH_ERRORS.ACCOUNT_NOT_APPROVED);

  const activeRole = pickPortalRole(userRoles, roleCode);
  if (!activeRole) {
    throw ApiError.fromAuthError(AUTH_ERRORS.PORTAL_ACCESS_DENIED);
  }

  const session = await sessionService.createSession({
    userId: String(user._id),
    user: toSessionUser(user),
    activeRole,
    availableRoles: userRoles,
    portal: activeRole,
    ipAddress,
    userAgent,
    deviceInfo,
  });

  void record({
    actorId: String(user._id),
    action: AUDIT_ACTION.LOGIN_SUCCESS,
    outcome: AUDIT_OUTCOME.SUCCESS,
    meta: { activeRole, portal: activeRole },
    ip: ipAddress,
    userAgent,
  });

  return {
    user: { ...user.toAuthJSON(), activeRole },
    token: session.token,
    sid: session.sid,
  };
};

const logoutAllSessions = async (userId: string): Promise<void> => {
  await sessionService.revokeAllSessions(userId);
  void record({
    actorId: userId,
    action: AUDIT_ACTION.LOGOUT_ALL,
    outcome: AUDIT_OUTCOME.SUCCESS,
  });
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

const requestRole = async (userId: string, roleCode: string, referralCode: string | null = null) => {
  const role = await Role.findByCode(roleCode);
  if (!role) throw ApiError.fromAuthError(AUTH_ERRORS.INVALID_ROLE_REQUEST);
  if (!role.canSelfRegister)
    throw ApiError.fromAuthError(AUTH_ERRORS.ROLE_NOT_AVAILABLE);

  const existingRole = await UserRole.findOne({ userId, roleCode });
  if (existingRole)
    throw ApiError.fromAuthError(AUTH_ERRORS.ROLE_ALREADY_EXISTS);

  const afterSignup = await runSignupHook({ roleCode, referralCode });

  const userObjectId = toObjectId(userId);
  const userRole = await UserRole.assignRole(userObjectId, roleCode, {
    requestedBy: userObjectId,
  });

  await afterSignup?.({ userId: userObjectId });
  if (userRole.status === USER_ROLE_STATUS.APPROVED) {
    await runRoleApprovedHook({ userId: userObjectId, roleCode });
    // A self-service grant must reach the caller's open sessions, like an admin approval does.
    await sessionService.syncRoles(userId, await UserRole.getUserRoleCodes(userObjectId));
  }

  return { role: { code: roleCode, status: userRole.status } };
};

export {
  register,
  login,
  pickPortalRole,
  logoutAllSessions,
  switchRole,
  getAvailableRoles,
  requestRole,
};
