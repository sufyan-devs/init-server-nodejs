import type { Request, Response, NextFunction } from 'express';
import sessionService, { cookieMaxAgeMs } from '@auth/services/session.service';
import { SESSION_INVALID_REASON, type SessionInvalidReason, type SessionRecord } from '@auth/models/Session';
import { Types } from 'mongoose';
import type { AuthUser } from '@user/models/User';
import ApiError from '@utils/apiError';
import AUTH_ERRORS, { type AuthError } from '@constants/authErrors';
import { getSessionToken, clearSessionCookie, refreshSessionCookie } from '@utils/cookieHelper';
import { record, AUDIT_ACTION, AUDIT_OUTCOME } from '@audit/index';

const INVALID_REASON_ERRORS: Record<SessionInvalidReason, AuthError> = {
  [SESSION_INVALID_REASON.NOT_FOUND]: AUTH_ERRORS.SESSION_NOT_FOUND,
  [SESSION_INVALID_REASON.MALFORMED]: AUTH_ERRORS.SESSION_EXPIRED,
  [SESSION_INVALID_REASON.SECRET_MISMATCH]: AUTH_ERRORS.SESSION_EXPIRED,
  [SESSION_INVALID_REASON.EXPIRED_ABSOLUTE]: AUTH_ERRORS.SESSION_EXPIRED,
  [SESSION_INVALID_REASON.PORTAL_MISMATCH]: AUTH_ERRORS.SESSION_EXPIRED,
};

const toAuthUser = (session: SessionRecord): AuthUser => ({
  _id: new Types.ObjectId(session.userId),
  email: session.user.email,
  firstName: session.user.firstName,
  lastName: session.user.lastName,
  emailVerified: session.user.emailVerified,
  profileImage: session.user.profileImage,
  activeRole: session.activeRole,
  availableRoles: session.availableRoles,
});

// Anything thrown here (e.g. Redis down) reaches next() as a 5xx: answering 401 would
// tell every client to drop a session that is still valid.
const authenticate = (roleCode: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = getSessionToken(req, roleCode);
      if (!token) return next(ApiError.fromAuthError(AUTH_ERRORS.SESSION_REQUIRED));

      const verified = await sessionService.verifySessionToken(token, roleCode);
      if (!verified.valid) {
        clearSessionCookie(res, roleCode);
        return next(ApiError.fromAuthError(INVALID_REASON_ERRORS[verified.reason]));
      }

      const { session } = verified;

      refreshSessionCookie(res, token, roleCode, cookieMaxAgeMs(session));

      req.user = toAuthUser(session);
      req.sessionId = session.sid;
      next();
    } catch (error: unknown) {
      next(error);
    }
  };
};

// Checks availableRoles, not activeRole: holding a role passes while acting as another.
const authorizeRoles = (...allowedRoles: string[]) => (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.user) return next(ApiError.fromAuthError(AUTH_ERRORS.SESSION_REQUIRED));
  const hasRole: boolean = allowedRoles.some((role: string) => (req.user!.availableRoles || []).includes(role));
  if (!hasRole) {
    void record({
      actorId: String(req.user._id),
      action: AUDIT_ACTION.PERMISSION_DENIED,
      outcome: AUDIT_OUTCOME.DENIED,
      resource: req.path,
      meta: { required: allowedRoles, activeRole: req.user.activeRole },
    });
    return next(ApiError.fromAuthError(AUTH_ERRORS.INSUFFICIENT_PERMISSIONS));
  }
  next();
};

export { authenticate, authorizeRoles };
