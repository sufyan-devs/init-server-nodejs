import type { Request, Response, NextFunction } from 'express';
import sessionService, { cookieMaxAgeMs } from '@auth/services/session.service';
import { SESSION_INVALID_REASON, type SessionInvalidReason, type SessionRecord } from '@auth/models/Session';
import { Types } from 'mongoose';
import type { AuthUser } from '@user/models/User';
import ApiError from '@utils/apiError';
import AuthErrors, { type AuthError } from '@constants/authErrors';
import { getSessionToken, getCookieOptions, refreshSessionCookie } from '@utils/cookieHelper';
import { logger } from '@utils/logger';
import { record, AUDIT_ACTION, AUDIT_OUTCOME } from '@audit/index';

const INVALID_REASON_ERRORS: Record<SessionInvalidReason, AuthError> = {
  [SESSION_INVALID_REASON.NOT_FOUND]: AuthErrors.SESSION_NOT_FOUND,
  [SESSION_INVALID_REASON.MALFORMED]: AuthErrors.SESSION_EXPIRED,
  [SESSION_INVALID_REASON.SECRET_MISMATCH]: AuthErrors.SESSION_EXPIRED,
  [SESSION_INVALID_REASON.EXPIRED_ABSOLUTE]: AuthErrors.SESSION_EXPIRED,
};

const clearCookie = (res: Response, cookieName: string): void => {
  res.cookie(cookieName, '', { ...getCookieOptions(), maxAge: 0 });
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

const authenticate = (portalRole?: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = getSessionToken(req, portalRole);
      if (!result) return next(ApiError.fromAuthError(401, AuthErrors.SESSION_REQUIRED));

      const { token, cookieName } = result;

      const verified = await sessionService.verifySessionToken(token);
      if (!verified.valid) {
        clearCookie(res, cookieName);
        return next(ApiError.fromAuthError(401, INVALID_REASON_ERRORS[verified.reason]));
      }

      const { session } = verified;

      refreshSessionCookie(res, cookieName, token, cookieMaxAgeMs(session));

      req.user = toAuthUser(session);
      req.sessionId = session.sid;
      next();
    } catch (error: unknown) {
      if (error instanceof ApiError) return next(error);
      logger.error('Session verification failed', { error: error instanceof Error ? error.message : String(error) });
      next(ApiError.fromAuthError(401, AuthErrors.SESSION_EXPIRED));
    }
  };
};

// Checks availableRoles, not activeRole: holding a role passes while acting as another.
const authorizeRoles = (...allowedRoles: string[]) => (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.user) return next(ApiError.fromAuthError(401, AuthErrors.SESSION_REQUIRED));
  const hasRole: boolean = allowedRoles.some((role: string) => (req.user!.availableRoles || []).includes(role));
  if (!hasRole) {
    void record({
      actorId: String(req.user._id),
      action: AUDIT_ACTION.PERMISSION_DENIED,
      outcome: AUDIT_OUTCOME.DENIED,
      resource: req.path,
      meta: { required: allowedRoles, activeRole: req.user.activeRole },
    });
    return next(ApiError.fromAuthError(403, AuthErrors.INSUFFICIENT_PERMISSIONS));
  }
  next();
};

export { authenticate, authorizeRoles };
