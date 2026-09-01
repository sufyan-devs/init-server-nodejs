import { createPortalAuthController } from '../shared/portalAuth';
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
  getReferralCode,
  socialLogin,
} = createPortalAuthController(ROLE_CODE.CUSTOMER);

export { forgotPassword, verifyResetOTP, resetPassword } from '../shared/passwordReset';
export { verifyEmailOTP, sendEmailOTP } from '../shared/emailVerification';
export { listSessions, revokeSessionById } from '../shared/sessions';
