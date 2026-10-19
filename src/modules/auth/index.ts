import type { Router } from 'express';
import { hashPassword, assertPasswordAllowed } from './services/password.service';
import sessionService, { toSessionUser } from './services/session.service';
import { SESSION_REVOKE_REASON } from './models/Session';
import { register as registerUser } from './services/auth.service';
import { authenticate, authorizeRoles } from './middlewares/authenticate';
import { verifyCsrf } from './middlewares/csrf';
import { setSignupHook, setRoleApprovedHook, runRoleApprovedHook } from './signupHooks';
import adminAuthRoutes from './routes/admin/auth';
import vendorAuthRoutes from './routes/vendor/auth';
import associateAuthRoutes from './routes/associate/auth';
import customerAuthRoutes from './routes/customer/auth';
import { PORTAL } from '@utils/cookieHelper';
import UserRole from '@user/models/UserRole';
import { toObjectId } from '@utils/mongoHelper';

interface SessionUserSource {
  email: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  profileImage?: string | null;
}

// authenticate() reads user status from the session, never the database, so a
// suspension that does not kill the sessions leaves access alive until they expire.
const revokeUserSessions = (userId: string): Promise<void> =>
  sessionService.revokeAllSessions(userId, SESSION_REVOKE_REASON.ACCOUNT_INACTIVE);

const syncSessionUser = (userId: string, user: SessionUserSource): Promise<void> =>
  sessionService.syncUser(userId, toSessionUser(user));

const syncSessionRoles = async (userId: string): Promise<void> =>
  sessionService.syncRoles(userId, await UserRole.getUserRoleCodes(toObjectId(userId)));

const register = (router: Router): void => {
  router.use(`/${PORTAL.ADMIN}/auth`, adminAuthRoutes);
  router.use(`/${PORTAL.VENDOR}/auth`, vendorAuthRoutes);
  router.use(`/${PORTAL.ASSOCIATE}/auth`, associateAuthRoutes);
  router.use(`/${PORTAL.CUSTOMER}/auth`, customerAuthRoutes);
};

export {
  register,
  registerUser,
  hashPassword,
  assertPasswordAllowed,
  revokeUserSessions,
  syncSessionUser,
  syncSessionRoles,
  authenticate,
  authorizeRoles,
  verifyCsrf,
  setSignupHook,
  setRoleApprovedHook,
  runRoleApprovedHook,
};
export type { SignupHook, RoleApprovedHook } from './signupHooks';
