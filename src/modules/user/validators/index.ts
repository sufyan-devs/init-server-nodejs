import { z } from 'zod';
import { normalizeEmail } from '@utils/format';
import { ROLE_CODE, ROLE_TYPE } from '@user/models/Role';
import { USER_ROLE_STATUS } from '@user/models/UserRole';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, { error: 'Invalid id' });

const email = z.string().trim().pipe(z.email()).transform(normalizeEmail);

const password = z.string().min(1);

const fullName = z.string().trim().min(1).max(120);

// '' is how a client clears the number, so it has to pass alongside a real one.
const phoneNumber = z.union([
  z.literal(''),
  z.string().trim().min(7).max(20).regex(/^\+?[0-9 ()-]+$/, { error: 'Invalid phone number' }),
]);

// Parsed here so the model receives the Date its schema declares, not a string.
const dateOfBirth = z.union([z.iso.date(), z.iso.datetime()]).transform((value) => new Date(value));

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

export const idParamSchema = z.object({ id: objectId });

// sortBy reaches a $sort key, so it is allow-listed; search reaches a $regex, so it is
// length-bounded here and escaped by the controller. Express also yields an array or object
// for a repeated or bracketed param, which is why every field is parsed and not just cast.
export const managedUserListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  search: z.string().trim().max(100).default(''),
  isActive: z.stringbool().optional(),
  isVerified: z.stringbool().optional(),
  sortBy: z.enum(['fullName', 'createdAt', 'email']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const updateProfileSchema = z.strictObject({
  fullName: fullName.optional(),
  phoneNumber: phoneNumber.optional(),
  dateOfBirth: dateOfBirth.nullable().optional(),
});

export const createManagedUserSchema = z.strictObject({
  fullName,
  email,
  password,
  phoneNumber: phoneNumber.optional(),
});

export const roleListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  search: z.string().trim().max(100).default(''),
  roleType: z.enum(ROLE_TYPE).optional(),
  sortBy: z.enum(['code', 'name', 'roleType', 'isActive', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const roleName = z.string().trim().min(1).max(100);
const roleDescription = z.string().trim().max(500);

export const createRoleSchema = z.strictObject({
  code: z.string().trim().toUpperCase().pipe(z.enum(ROLE_CODE)),
  name: roleName,
  description: roleDescription.default(''),
  roleType: z.enum(ROLE_TYPE),
  canSelfRegister: z.boolean().default(false),
  autoApproveOnSignup: z.boolean().default(false),
  emailVerificationRequired: z.boolean().default(false),
});

export const updateRoleSchema = z.strictObject({
  name: roleName.optional(),
  description: roleDescription.optional(),
  roleType: z.enum(ROLE_TYPE).optional(),
  canSelfRegister: z.boolean().optional(),
  autoApproveOnSignup: z.boolean().optional(),
  emailVerificationRequired: z.boolean().optional(),
});

export type ManagedUserListQuery = z.infer<typeof managedUserListQuerySchema>;
export type RoleListQuery = z.infer<typeof roleListQuerySchema>;

export const roleRequestListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  status: z.enum(USER_ROLE_STATUS).default(USER_ROLE_STATUS.PENDING),
  roleCode: z.enum(ROLE_CODE).optional(),
});

export type RoleRequestListQuery = z.infer<typeof roleRequestListQuerySchema>;

export const rejectRoleRequestSchema = z
  .strictObject({ reason: z.string().trim().max(500).optional() })
  .default({});

