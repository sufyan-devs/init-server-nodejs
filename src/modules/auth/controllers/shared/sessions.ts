import sessionService from '@auth/services/session.service';
import { record, AUDIT_ACTION, AUDIT_OUTCOME } from '@audit/index';
import catchAsync from '@utils/catchAsync';
import response from '@utils/response';
import { getClientIp } from '@utils/clientIp';

export const listSessions = catchAsync(async (req, res) => {
  const sessions = await sessionService.listUserSessions(
    String(req.user!._id),
    req.sessionId,
  );
  return response.success(res, { sessions });
});

export const revokeSessionById = catchAsync(async (req, res) => {
  const sid = String(req.params.sid);
  await sessionService.revokeOwnSession(sid, String(req.user!._id));

  void record({
    actorId: String(req.user!._id),
    action: AUDIT_ACTION.SESSION_REVOKED,
    outcome: AUDIT_OUTCOME.SUCCESS,
    resource: 'session',
    resourceId: sid,
    ip: getClientIp(req),
    userAgent: req.get('User-Agent'),
  });

  return response.success(res, { message: 'Session revoked', sid });
});
