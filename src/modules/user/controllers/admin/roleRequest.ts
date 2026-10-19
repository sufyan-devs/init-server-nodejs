import type { Request } from 'express';
import UserRole, { USER_ROLE_STATUS } from '@user/models/UserRole';
import { syncSessionRoles, runRoleApprovedHook } from '@auth/index';
import { record, AUDIT_ACTION, AUDIT_OUTCOME, type AuditAction } from '@audit/index';
import catchAsync from '@utils/catchAsync';
import ApiError from '@utils/apiError';
import response from '@utils/response';
import type { RoleRequestListQuery } from '@user/validators';

const findPendingRequest = async (id: string) => {
  const userRole = await UserRole.findById(id);
  if (!userRole) throw ApiError.notFound('Role request not found', 'ROLE_REQUEST_NOT_FOUND');
  if (userRole.status !== USER_ROLE_STATUS.PENDING) {
    throw ApiError.badRequest(`Role request is already ${userRole.status}`, 'ROLE_REQUEST_NOT_PENDING');
  }
  return userRole;
};

const recordDecision = (req: Request, action: AuditAction, requestId: string, meta: Record<string, unknown>) => {
  void record({
    actorId: String(req.user!._id),
    action,
    outcome: AUDIT_OUTCOME.SUCCESS,
    resource: 'role_request',
    resourceId: requestId,
    meta,
    ip: req.ip ?? '',
    userAgent: req.get('User-Agent'),
  });
};

export const list = catchAsync(async (req, res) => {
  const { page, limit, status, roleCode } = req.query as unknown as RoleRequestListQuery;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = { status };
  if (roleCode) filter.roleCode = roleCode;

  const [requests, total] = await Promise.all([
    UserRole.find(filter)
      .sort({ requestedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'email firstName lastName')
      .lean(),
    UserRole.countDocuments(filter),
  ]);

  return response.success(res, {
    requests,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  });
});

export const approve = catchAsync(async (req, res) => {
  const userRole = await findPendingRequest(String(req.params.id));

  userRole.status = USER_ROLE_STATUS.APPROVED;
  userRole.isActive = true;
  userRole.approvedAt = new Date();
  userRole.approvedBy = req.user!._id;
  await userRole.save();

  await runRoleApprovedHook({ userId: userRole.userId, roleCode: userRole.roleCode });
  await syncSessionRoles(String(userRole.userId));
  recordDecision(req, AUDIT_ACTION.ROLE_REQUEST_APPROVED, String(userRole._id), {
    userId: String(userRole.userId),
    roleCode: userRole.roleCode,
  });

  return response.success(res, { request: userRole }, 200, 'Role request approved');
});

export const reject = catchAsync(async (req, res) => {
  const userRole = await findPendingRequest(String(req.params.id));
  const { reason } = req.body as { reason?: string };

  userRole.status = USER_ROLE_STATUS.REJECTED;
  userRole.isActive = false;
  userRole.rejectedAt = new Date();
  userRole.rejectedBy = req.user!._id;
  if (reason) userRole.rejectionReason = reason;
  await userRole.save();

  recordDecision(req, AUDIT_ACTION.ROLE_REQUEST_REJECTED, String(userRole._id), {
    userId: String(userRole.userId),
    roleCode: userRole.roleCode,
  });

  return response.success(res, { request: userRole }, 200, 'Role request rejected');
});
