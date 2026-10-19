import { Router } from 'express';
import * as onboardController from '@referral/controllers/associate/onboard';
import * as couponController from '@referral/controllers/associate/coupon';
import { authenticate, authorizeRoles } from '@auth/index';
import { ROLE_CODE } from '@user/models/Role';

const router = Router();

const requireBA = [authenticate(ROLE_CODE.BUSINESS_ASSOCIATE), authorizeRoles(ROLE_CODE.BUSINESS_ASSOCIATE)];

router.get('/onboard', ...requireBA, onboardController.list);
router.post('/onboard', ...requireBA, onboardController.registerOnboard);
router.get('/coupons', ...requireBA, couponController.list);

export default router;
