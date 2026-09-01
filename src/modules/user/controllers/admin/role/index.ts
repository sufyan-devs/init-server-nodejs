import Role, { ROLE_TYPE } from '@user/models/Role';
import catchAsync from '@utils/catchAsync';
import ApiError from '@utils/apiError';
import response from '@utils/response';
import { isValidObjectId } from '@utils/mongoHelper';

export const list = catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search = "",
    roleType,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  const query: Record<string, unknown> = {};
  if (roleType && Object.values(ROLE_TYPE).includes(roleType as any)) {
    query.roleType = roleType;
  }
  if ((search as string).trim()) {
    query.$or = [
      { name: { $regex: (search as string).trim(), $options: "i" } },
      { description: { $regex: (search as string).trim(), $options: "i" } },
      { code: { $regex: (search as string).trim(), $options: "i" } },
    ];
  }

  const sortStage = { [sortBy as string]: sortOrder === "asc" ? 1 : -1 };
  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
  const skip = (pageNum - 1) * limitNum;

  const [roles, total] = await Promise.all([
    Role.find(query).sort(sortStage as any).skip(skip).limit(limitNum).lean(),
    Role.countDocuments(query),
  ]);

  return response.success(res, {
    roles,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
      hasNext: pageNum * limitNum < total,
      hasPrev: pageNum > 1,
    },
  });
});

export const getById = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid role ID");
  }

  const role = await Role.findById(id).lean();
  if (!role) {
    throw ApiError.notFound("Role not found");
  }

  return response.success(res, { role });
});

export const create = catchAsync(async (req, res) => {
  const {
    code,
    name,
    description,
    roleType,
    canSelfRegister,
    autoApproveOnSignup,
    emailVerificationRequired,
  } = req.body;

  if (!code || !name || !roleType) {
    throw ApiError.badRequest("Code, name, and role type are required");
  }

  if (!Object.values(ROLE_TYPE).includes(roleType)) {
    throw ApiError.badRequest("Role type must be SYSTEM or APPLICATION");
  }

  const existing = await Role.findOne({ code: code.toUpperCase() });
  if (existing) {
    throw ApiError.conflict("A role with this code already exists");
  }

  const role = await Role.create({
    code: code.toUpperCase(),
    name: name.trim(),
    description: description?.trim() || "",
    roleType,
    canSelfRegister: canSelfRegister || false,
    autoApproveOnSignup: autoApproveOnSignup || false,
    emailVerificationRequired: emailVerificationRequired || false,
  });

  return response.created(res, { role }, "Role created successfully");
});

export const update = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid role ID");
  }

  const role = await Role.findById(id);
  if (!role) {
    throw ApiError.notFound("Role not found");
  }

  const {
    name,
    description,
    roleType,
    canSelfRegister,
    autoApproveOnSignup,
    emailVerificationRequired,
  } = req.body;

  role.name = name;
  role.description = description;
  role.roleType = roleType;
  role.canSelfRegister = canSelfRegister;
  role.autoApproveOnSignup = autoApproveOnSignup;
  role.emailVerificationRequired = emailVerificationRequired;

  await role.save();

  return response.success(res, { role }, 200, "Role updated successfully");
});

export const toggleActive = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid role ID");
  }

  const role = await Role.findById(id);
  if (!role) {
    throw ApiError.notFound("Role not found");
  }

  role.isActive = !role.isActive;
  await role.save();

  return response.success(
    res,
    { role },
    200,
    `Role ${role.isActive ? "activated" : "deactivated"} successfully`,
  );
});
