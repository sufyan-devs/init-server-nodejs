import type { Router } from 'express';
import { hashPassword, assertPasswordAllowed } from './services/password.service';
import sessionService, { toSessionUser } from './services/session.service';
import { SESSION_REVOKE_REASON } from './models/Session';
import { register as registerUser } from './controllers/shared/authHelper';
import adminAuthRoutes from './routes/admin/auth';
import vendorAuthRoutes from './routes/vendor/auth';
import associateAuthRoutes from './routes/associate/auth';
import customerAuthRoutes from './routes/customer/auth';

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

const register = (router: Router): void => {
  router.use('/admin/auth', adminAuthRoutes);
  router.use('/vendor/auth', vendorAuthRoutes);
  router.use('/associate/auth', associateAuthRoutes);
  router.use('/customer/auth', customerAuthRoutes);
};

export {
  register,
  registerUser,
  hashPassword,
  assertPasswordAllowed,
  revokeUserSessions,
  syncSessionUser,
};
