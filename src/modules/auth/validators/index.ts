import { z } from 'zod';
import { normalizeEmail } from '@utils/format';

const NAME_MAX = 60;
const DEVICE_INFO_MAX = 200;
const PHONE_MAX = 20;
const REFERRAL_CODE_MAX = 32;

const email = z.string().trim().pipe(z.email()).transform(normalizeEmail);

// A JSON number is a valid way to send 1234; stringify so the compare is string-to-string.
const otp = z
  .union([z.string(), z.number()], { error: 'OTP is required' })
  .transform((value) => String(value).trim())
  .pipe(z.string().min(1, { error: 'OTP is required' }));

// Length and the breach check belong to assertPasswordAllowed — one rule, one source.
const password = z.string().min(1);

const roleCode = z.string().trim().min(1);

const referralCode = z.string().trim().max(REFERRAL_CODE_MAX).optional();

export const loginSchema = z.object({
  email,
  password,
  deviceInfo: z.string().max(DEVICE_INFO_MAX).optional(),
});

export const registerSchema = z.object({
  email,
  password,
  firstName: z.string().trim().min(1).max(NAME_MAX),
  lastName: z.string().trim().min(1).max(NAME_MAX),
  phone: z.string().trim().max(PHONE_MAX).optional(),
  referralCode,
});

export const otpSchema = z.object({ email, otp });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({ email, newPassword: password });

export const switchRoleSchema = z.object({ roleCode });

export const requestRoleSchema = z.object({ roleCode, referralCode });

// Permissive by design: stripping unknown keys would empty the body before the provider sees it.
export const oauthSchema = z.looseObject({});

export const sessionParamsSchema = z.object({ sid: z.string().min(1) });
