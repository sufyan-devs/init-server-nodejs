import { Router } from 'express';
import * as couponController from '../../controllers/vendor';
import { authenticate, authorizeRoles } from '@middlewares/authenticate';
import { ROLE_CODE } from '@user/models/Role';

const router = Router();

const requireVendor = [authenticate(ROLE_CODE.VENDOR), authorizeRoles(ROLE_CODE.VENDOR)];

router.post('/', ...requireVendor, couponController.create);
router.get('/', ...requireVendor, couponController.list);

router.post('/redeem/verify-code', ...requireVendor, couponController.verifyRedemptionCode);
router.post('/redeem/verify-otp', ...requireVendor, couponController.verifyRedemptionOtp);
router.post('/redeem/confirm', ...requireVendor, couponController.confirmRedemption);
router.post('/redeem/resend-otp', ...requireVendor, couponController.resendRedemptionOtp);

router.get('/redemptions', ...requireVendor, couponController.couponRedemptions);
router.get('/redemptions/:id', ...requireVendor, couponController.couponRedemptionDetail);

router.get('/:id', ...requireVendor, couponController.getById);
router.put('/:id', ...requireVendor, couponController.update);
router.patch('/:id/submit', ...requireVendor, couponController.submit);
router.patch('/:id/deactivate', ...requireVendor, couponController.deactivate);
router.delete('/:id', ...requireVendor, couponController.remove);

export default router;
