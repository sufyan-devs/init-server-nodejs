import { Router } from 'express';
import * as roleRequestController from '@user/controllers/admin/roleRequest';
import { authenticate, authorizeRoles } from '@auth/index';
import { ROLE_CODE } from '@user/models/Role';
import { validate } from '@middlewares/validate';
import { idParamSchema, roleRequestListQuerySchema, rejectRoleRequestSchema } from '@user/validators';

const router = Router();

const requireAdmin = [authenticate(ROLE_CODE.ADMIN), authorizeRoles(ROLE_CODE.ADMIN, ROLE_CODE.SUPER_ADMIN)];

router.get('/', ...requireAdmin, validate({ query: roleRequestListQuerySchema }), roleRequestController.list);
router.patch('/:id/approve', ...requireAdmin, validate({ params: idParamSchema }), roleRequestController.approve);
router.patch('/:id/reject', ...requireAdmin, validate({ params: idParamSchema, body: rejectRoleRequestSchema }), roleRequestController.reject);

export default router;
