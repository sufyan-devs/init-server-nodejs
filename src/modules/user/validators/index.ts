import { z } from 'zod';
import { normalizeEmail } from '@utils/format';

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

// sortBy reaches a $sort key and search reaches a $regex, so both are allow-listed
// rather than sanitised. Express also yields an array or object for a repeated or
// bracketed param, which is why every field is parsed and not just cast.
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

export type ManagedUserListQuery = z.infer<typeof managedUserListQuerySchema>;

