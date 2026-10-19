import { Router } from 'express';
import { getReferralCode } from '@referral/controllers/shared/referralCode';
import { authenticate, authorizeRoles } from '@auth/index';
import { ROLE_CODE } from '@user/models/Role';

const router = Router();

const requireVendor = [authenticate(ROLE_CODE.VENDOR), authorizeRoles(ROLE_CODE.VENDOR)];

router.get('/referral-code', ...requireVendor, getReferralCode);

export default router;
