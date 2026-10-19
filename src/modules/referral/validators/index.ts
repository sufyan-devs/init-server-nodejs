import { z } from 'zod';
import { normalizeEmail } from '@utils/format';
import { ROLE_CODE } from '@user/models/Role';
import { REFERRAL_STATUS } from '@referral/models/Referral';

const NAME_MAX = 60;
const PHONE_MAX = 20;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export const onboardListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  status: z.enum(REFERRAL_STATUS).optional(),
  sortBy: z.enum(['referredAt', 'status', 'roleAppliedFor']).default('referredAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type OnboardListQuery = z.infer<typeof onboardListQuerySchema>;

export const onboardSchema = z.strictObject({
  email: z.string().trim().pipe(z.email()).transform(normalizeEmail),
  firstName: z.string().trim().min(1).max(NAME_MAX),
  lastName: z.string().trim().min(1).max(NAME_MAX),
  phone: z.string().trim().max(PHONE_MAX).optional(),
  role: z.enum([ROLE_CODE.VENDOR, ROLE_CODE.CUSTOMER]),
});
