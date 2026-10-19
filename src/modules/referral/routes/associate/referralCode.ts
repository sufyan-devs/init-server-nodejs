import { Router } from 'express';
import { getReferralCode } from '@referral/controllers/shared/referralCode';
import { authenticate, authorizeRoles } from '@auth/index';
import { ROLE_CODE } from '@user/models/Role';

const router = Router();

const requireBA = [authenticate(ROLE_CODE.BUSINESS_ASSOCIATE), authorizeRoles(ROLE_CODE.BUSINESS_ASSOCIATE)];

router.get('/referral-code', ...requireBA, getReferralCode);

export default router;
