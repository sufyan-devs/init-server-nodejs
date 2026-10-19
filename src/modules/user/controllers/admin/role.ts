import type { Request } from 'express';
import type { SortOrder } from 'mongoose';
import Role from '@user/models/Role';
import { record, AUDIT_ACTION, AUDIT_OUTCOME, type AuditAction } from '@audit/index';
import catchAsync from '@utils/catchAsync';
import ApiError from '@utils/apiError';
import response from '@utils/response';
import { escapeRegex } from '@utils/format';
import type { RoleListQuery } from '@user/validators';

const findRole = async (id: string) => {
  const role = await Role.findById(id);
  if (!role) throw ApiError.notFound('Role not found', 'ROLE_NOT_FOUND');
  return role;
};

const recordRoleAction = (req: Request, action: AuditAction, roleId: string, meta: Record<string, unknown>) => {
  void record({
    actorId: String(req.user!._id),
    action,
    outcome: AUDIT_OUTCOME.SUCCESS,
    resource: 'role',
    resourceId: roleId,
    meta,
    ip: req.ip ?? '',
    userAgent: req.get('User-Agent'),
  });
};

export const list = catchAsync(async (req, res) => {
  const { page, limit, search, roleType, sortBy, sortOrder } = req.query as unknown as RoleListQuery;
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {};
  if (roleType) query.roleType = roleType;
  if (search) {
    const searchRegex = { $regex: escapeRegex(search), $options: 'i' };
    query.$or = [{ name: searchRegex }, { description: searchRegex }, { code: searchRegex }];
  }

  const sortStage: Record<string, SortOrder> = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

  const [roles, total] = await Promise.all([
    Role.find(query).sort(sortStage).skip(skip).limit(limit).lean(),
    Role.countDocuments(query),
  ]);

  return response.success(res, {
    roles,
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

export const getById = catchAsync(async (req, res) => {
  const role = await Role.findById(req.params.id).lean();
  if (!role) throw ApiError.notFound('Role not found', 'ROLE_NOT_FOUND');

  return response.success(res, { role });
});

export const create = catchAsync(async (req, res) => {
  const existing = await Role.exists({ code: req.body.code });
  if (existing) {
    throw ApiError.conflict('A role with this code already exists', 'ROLE_CODE_EXISTS');
  }

  const role = await Role.create(req.body);
  recordRoleAction(req, AUDIT_ACTION.ROLE_CREATED, String(role._id), { code: role.code });

  return response.created(res, { role }, 'Role created successfully');
});

export const update = catchAsync(async (req, res) => {
  const role = await findRole(String(req.params.id));

  role.set(req.body);
  await role.save();
  recordRoleAction(req, AUDIT_ACTION.ROLE_UPDATED, String(role._id), { fields: Object.keys(req.body) });

  return response.success(res, { role }, 200, 'Role updated successfully');
});

export const toggleStatus = catchAsync(async (req, res) => {
  const role = await findRole(String(req.params.id));

  role.isActive = !role.isActive;
  await role.save();
  recordRoleAction(req, AUDIT_ACTION.ROLE_STATUS_CHANGED, String(role._id), { isActive: role.isActive });

  return response.success(
    res,
    { role },
    200,
    `Role ${role.isActive ? 'activated' : 'deactivated'} successfully`,
  );
});
