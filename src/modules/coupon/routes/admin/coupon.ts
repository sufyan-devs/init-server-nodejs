import { Router } from 'express';
import * as couponController from '../../controllers/admin';
import * as redemptionController from '../../controllers/admin/redemption';
import { authenticate, authorizeRoles } from '@middlewares/authenticate';
import { ROLE_CODE } from '@user/models/Role';

const router = Router();

const requireAdmin = [authenticate(ROLE_CODE.ADMIN), authorizeRoles(ROLE_CODE.ADMIN, ROLE_CODE.SUPER_ADMIN)];

router.get('/', ...requireAdmin, couponController.list);

router.get('/redemptions', ...requireAdmin, redemptionController.couponRedemptions);
router.get('/redemptions/:id', ...requireAdmin, redemptionController.couponRedemptionDetail);

router.get('/:id', ...requireAdmin, couponController.getById);
router.patch('/:id/approve', ...requireAdmin, couponController.approve);
router.patch('/:id/publish', ...requireAdmin, couponController.publish);
router.patch('/:id/reject', ...requireAdmin, couponController.reject);
router.patch('/:id/deactivate', ...requireAdmin, couponController.deactivate);

export default router;
