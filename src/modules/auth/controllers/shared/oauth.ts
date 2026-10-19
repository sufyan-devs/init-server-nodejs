import type { Request, Response } from 'express';
import UserRole from '@user/models/UserRole';
import { getProvider, getEnabledProviderIds } from '@auth/providers';
import { resolveUser } from '@auth/services/identity.service';
import { pickPortalRole } from '@auth/services/auth.service';
import sessionService, { toSessionUser } from '@auth/services/session.service';
import { record, AUDIT_ACTION, AUDIT_OUTCOME } from '@audit/index';
import ApiError from '@utils/apiError';
import AUTH_ERRORS from '@constants/authErrors';
import catchAsync from '@utils/catchAsync';
import response from '@utils/response';
import { setSessionCookie } from '@utils/cookieHelper';
import { issueCsrfToken } from '@auth/middlewares/csrf';

const oauthLogin = (roleCode: string) =>
  catchAsync(async (req: Request, res: Response) => {
    const providerId = String(req.params.provider);

    // Password login is not a registered provider: it is /login's own path, which
    // carries the email-verification gate this route does not.
    const provider = getProvider(providerId);

    if (!provider) {
      throw ApiError.notFound(
        `Unknown or disabled login provider. Enabled: ${getEnabledProviderIds().join(', ') || 'none'}`,
        'PROVIDER_NOT_AVAILABLE',
      );
    }

    const body = (req.body ?? {}) as Record<string, unknown>;

    const identity = await provider.verify(body);

    const { user, userId, isNewUser } = await resolveUser(identity, roleCode);

    const availableRoles = await UserRole.getUserRoleCodes(user._id);
    if (availableRoles.length === 0) {
      throw ApiError.fromAuthError(AUTH_ERRORS.ACCOUNT_NOT_APPROVED);
    }
    const activeRole = pickPortalRole(availableRoles, roleCode);
    if (!activeRole) {
      throw ApiError.fromAuthError(AUTH_ERRORS.PORTAL_ACCESS_DENIED);
    }

    const ipAddress = req.ip ?? '';
    const userAgent = req.get('User-Agent');

    const session = await sessionService.createSession({
      userId,
      user: toSessionUser(user),
      activeRole,
      availableRoles,
      portal: activeRole,
      ipAddress,
      userAgent,
      deviceInfo: typeof body.deviceInfo === 'string' ? body.deviceInfo : undefined,
    });

    void record({
      actorId: userId,
      action: AUDIT_ACTION.LOGIN_SUCCESS,
      outcome: AUDIT_OUTCOME.SUCCESS,
      meta: { provider: identity.provider, activeRole, portal: activeRole, isNewUser },
      ip: ipAddress,
      userAgent,
    });

    setSessionCookie(res, session.token, roleCode);
    const csrfToken = await issueCsrfToken(res, session.sid, roleCode);

    return response.success(res, {
      user: { ...user.toAuthJSON(), activeRole },
      isNewUser,
      csrfToken,
    });
  });

export { oauthLogin };
