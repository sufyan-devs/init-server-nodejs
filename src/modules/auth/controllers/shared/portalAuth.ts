import { oauthLogin } from './oauth';
import * as authService from '@auth/services/auth.service';
import sessionService from '@auth/services/session.service';
import { record, AUDIT_ACTION, AUDIT_OUTCOME } from '@audit/index';
import catchAsync from '@utils/catchAsync';
import response from '@utils/response';
import { setSessionCookie, clearSessionCookie } from '@utils/cookieHelper';
import { issueCsrfToken } from '@auth/middlewares/csrf';
import { USER_ROLE_STATUS } from '@user/models/UserRole';

const createPortalAuthController = (roleCode: string) => {
  const register = catchAsync(async (req, res) => {
    const { email, password, firstName, lastName, phone, referralCode } = req.body;
    const { message, ...result } = await authService.register({
      email,
      password,
      firstName,
      lastName,
      phone,
      roleCode,
      referralCode,
    });
    return response.created(res, result, message);
  });

  const login = catchAsync(async (req, res) => {
    const { email, password } = req.body;
    const result = await authService.login(
      { email, password, roleCode },
      {
        ipAddress: req.ip ?? '',
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
    if (req.sessionId) {
      await sessionService.revokeSession(req.sessionId, String(req.user!._id));
      void record({
        actorId: String(req.user!._id),
        action: AUDIT_ACTION.LOGOUT,
        outcome: AUDIT_OUTCOME.SUCCESS,
        resource: 'session',
        resourceId: req.sessionId,
        ip: req.ip ?? '',
        userAgent: req.get('User-Agent'),
      });
    }
    clearSessionCookie(res, roleCode);
    return response.success(res, null, 200, 'Logged out successfully');
  });

  const logoutAll = catchAsync(async (req, res) => {
    await authService.logoutAllSessions(String(req.user!._id));
    clearSessionCookie(res, roleCode);
    return response.success(res, null, 200, 'All sessions logged out');
  });

  const getMe = catchAsync(async (req, res) => response.success(res, { user: req.user }));

  const switchRole = catchAsync(async (req, res) => {
    const result = await authService.switchRole(
      req.sessionId!,
      req.body.roleCode,
      req.user!.availableRoles,
    );
    return response.success(res, result);
  });

  const getAvailableRoles = catchAsync(async (req, res) => {
    const roles = await authService.getAvailableRoles(String(req.user!._id));
    return response.success(res, { roles });
  });

  const requestRole = catchAsync(async (req, res) => {
    const result = await authService.requestRole(
      String(req.user!._id),
      req.body.roleCode,
      req.body.referralCode,
    );
    const message = result.role.status === USER_ROLE_STATUS.APPROVED
      ? 'Role granted.'
      : 'Request submitted. Awaiting admin approval.';
    return response.success(res, result, 200, message);
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
    socialLogin: oauthLogin(roleCode),
  };
};

export { createPortalAuthController };
