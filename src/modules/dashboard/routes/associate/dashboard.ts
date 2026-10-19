import { Router } from 'express';
import * as dashboardController from '@dashboard/controllers/associate';
import { authenticate, authorizeRoles } from '@auth/index';
import { ROLE_CODE } from '@user/models/Role';

const router = Router();

const requireBA = [authenticate(ROLE_CODE.BUSINESS_ASSOCIATE), authorizeRoles(ROLE_CODE.BUSINESS_ASSOCIATE)];

router.get('/stats', ...requireBA, dashboardController.stats);

export default router;
