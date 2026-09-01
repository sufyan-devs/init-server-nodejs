import { oauthLogin } from './oauth';
import * as authHelper from './authHelper';
import sessionService from '@auth/services/session.service';
import catchAsync from '@utils/catchAsync';
import response from '@utils/response';
import { setSessionCookie, clearSessionCookie } from '@utils/cookieHelper';
import { issueCsrfToken } from '@middlewares/csrf';
import { getClientIp } from '@utils/clientIp';

const createPortalAuthController = (roleCode: string) => {
  const register = catchAsync(async (req, res) => {
    const { email, password, firstName, lastName, phone, referralCode } = req.body;
    const result = await authHelper.register({
      email,
      password,
      firstName,
      lastName,
      phone,
      roleCode,
      referralCode,
    });
    return response.created(res, result);
  });

  const login = catchAsync(async (req, res) => {
    const { email, password } = req.body;
    const result = await authHelper.login(
      { email, password, roleCode },
      {
        ipAddress: getClientIp(req),
        userAgent: req.get('User-Agent'),
        deviceInfo: req.body.deviceInfo,
      },
    );

    if (result.requiresEmailVerification) {
      return response.success(res, { requiresEmailVerification: true, email: result.email });
    }

    setSessionCookie(res, result.token!, roleCode);
    const csrfToken = await issueCsrfToken(res, result.sid!, roleCode);

    const { token: _token, sid: _sid, ...data } = result;
    return response.success(res, { ...data, csrfToken });
  });

  const logout = catchAsync(async (req, res) => {
    if (req.sessionId) await sessionService.revokeSession(req.sessionId, String(req.user!._id));
    clearSessionCookie(res, roleCode);
    return response.success(res, { message: 'Logged out successfully' });
  });

  const logoutAll = catchAsync(async (req, res) => {
    const result = await authHelper.logoutAllSessions(String(req.user!._id));
    clearSessionCookie(res, roleCode);
    return response.success(res, result);
  });

  const getMe = catchAsync(async (req, res) => response.success(res, { user: req.user }));

  const switchRole = catchAsync(async (req, res) => {
    const result = await authHelper.switchRole(
      req.sessionId!,
      req.body.roleCode,
      req.user!.availableRoles,
    );
    return response.success(res, result);
  });

  const getAvailableRoles = catchAsync(async (req, res) => {
    const roles = await authHelper.getAvailableRoles(String(req.user!._id));
    return response.success(res, { roles });
  });

  const requestRole = catchAsync(async (req, res) => {
    const result = await authHelper.requestRole(
      String(req.user!._id),
      req.body.roleCode,
      req.body.referralCode,
    );
    return response.success(res, result);
  });

  const getReferralCode = catchAsync(async (req, res) => {
    const result = await authHelper.getReferralCode(String(req.user!._id));
    return response.success(res, result);
  });

  return {
    register,
    login,
    logout,
    logoutAll,
    getMe,
    switchRole,
    getAvailableRoles,
    requestRole,
    getReferralCode,
    socialLogin: oauthLogin(roleCode),
  };
};

export { createPortalAuthController };
