import { createPortalAuthController } from '@auth/controllers/shared/portalAuth';
import { ROLE_CODE } from '@user/models/Role';

export const {
  register,
  login,
  logout,
  logoutAll,
  getMe,
  switchRole,
  getAvailableRoles,
  requestRole,
  socialLogin,
} = createPortalAuthController(ROLE_CODE.CUSTOMER);

export { forgotPassword, verifyResetOtp, resetPassword } from '@auth/controllers/shared/passwordReset';
export { verifyEmailOtp, sendEmailOtp } from '@auth/controllers/shared/emailVerification';
export { listSessions, revokeSessionById } from '@auth/controllers/shared/sessions';
