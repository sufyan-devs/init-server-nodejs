import { Router } from 'express';
import * as couponController from '@coupon/controllers/public';

const router = Router();

router.get('/', couponController.list);
router.get('/:id', couponController.getById);

export default router;
