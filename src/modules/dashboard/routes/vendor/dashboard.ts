import { Router } from 'express';
import * as dashboardController from '@dashboard/controllers/vendor';
import { authenticate, authorizeRoles } from '@auth/index';
import { ROLE_CODE } from '@user/models/Role';

const router = Router();

const requireVendor = [authenticate(ROLE_CODE.VENDOR), authorizeRoles(ROLE_CODE.VENDOR)];

router.get('/stats', ...requireVendor, dashboardController.stats);

export default router;
