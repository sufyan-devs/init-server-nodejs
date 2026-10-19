import { Router } from 'express';
import * as couponController from '@coupon/controllers/customer';
import { authenticate, authorizeRoles } from '@auth/index';
import { ROLE_CODE } from '@user/models/Role';

const router = Router();

const requireCustomer = [authenticate(ROLE_CODE.CUSTOMER), authorizeRoles(ROLE_CODE.CUSTOMER)];

router.post('/purchase', ...requireCustomer, couponController.purchase);
router.get('/my-purchases', ...requireCustomer, couponController.myPurchases);
router.post('/:purchaseId/generate-code', ...requireCustomer, couponController.generateRedeemCode);

export default router;
