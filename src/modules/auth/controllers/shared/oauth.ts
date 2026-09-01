import type { Request, Response } from 'express';
import UserRole from '@user/models/UserRole';
import { AUTH_PROVIDER, getProvider, getEnabledProviderIds } from '@auth/providers';
import { resolveUser } from '@auth/services/identity.service';
import sessionService, { toSessionUser } from '@auth/services/session.service';
import ApiError from '@utils/apiError';
import AuthErrors from '@constants/authErrors';
import catchAsync from '@utils/catchAsync';
import response from '@utils/response';
import { setSessionCookie } from '@utils/cookieHelper';
import { issueCsrfToken } from '@middlewares/csrf';
import { getClientIp } from '@utils/clientIp';

const oauthLogin = (portalRole: string) =>
  catchAsync(async (req: Request, res: Response) => {
    const providerId = String(req.params.provider);

    // Password login is /login's own path; routed here it would skip the email-verification gate.
    const provider =
      providerId === AUTH_PROVIDER.PASSWORD ? undefined : getProvider(providerId);

    if (!provider) {
      throw ApiError.notFound(
        `Unknown or disabled login provider. Enabled: ${getEnabledProviderIds().join(', ') || 'none'}`,
        'PROVIDER_NOT_AVAILABLE',
      );
    }

    const body = (req.body ?? {}) as Record<string, unknown>;

    const identity = await provider.verify(body);

    const { user, userId, isNewUser } = await resolveUser(identity, portalRole);

    const availableRoles = await UserRole.getUserRoleCodes(user._id);
    if (availableRoles.length === 0) {
      throw ApiError.fromAuthError(403, AuthErrors.ACCOUNT_NOT_APPROVED);
    }
    if (!availableRoles.includes(portalRole)) {
      throw ApiError.fromAuthError(403, AuthErrors.PORTAL_ACCESS_DENIED);
    }

    const session = await sessionService.createSession({
      userId,
      user: toSessionUser(user),
      activeRole: portalRole,
      availableRoles,
      portal: portalRole,
      ipAddress: getClientIp(req),
      userAgent: req.get('User-Agent'),
      deviceInfo: typeof body.deviceInfo === 'string' ? body.deviceInfo : undefined,
    });

    setSessionCookie(res, session.token, portalRole);
    const csrfToken = await issueCsrfToken(res, session.sid, portalRole);

    return response.success(res, {
      user: { ...user.toAuthJSON(), activeRole: portalRole },
      isNewUser,
      csrfToken,
    });
  });

export { oauthLogin };
