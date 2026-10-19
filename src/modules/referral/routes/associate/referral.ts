import { Router } from 'express';
import * as onboardController from '@referral/controllers/associate/onboard';
import { authenticate, authorizeRoles } from '@auth/index';
import { ROLE_CODE } from '@user/models/Role';
import { validate } from '@middlewares/validate';
import { onboardListQuerySchema, onboardSchema } from '@referral/validators';

const router = Router();

const requireBA = [authenticate(ROLE_CODE.BUSINESS_ASSOCIATE), authorizeRoles(ROLE_CODE.BUSINESS_ASSOCIATE)];

router.get('/onboard', ...requireBA, validate({ query: onboardListQuerySchema }), onboardController.list);
router.post('/onboard', ...requireBA, validate({ body: onboardSchema }), onboardController.registerOnboard);

export default router;
