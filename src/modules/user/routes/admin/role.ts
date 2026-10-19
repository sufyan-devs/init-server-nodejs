import { Router } from 'express';
import * as roleController from '@user/controllers/admin/role';
import { authenticate, authorizeRoles } from '@auth/index';
import { ROLE_CODE } from '@user/models/Role';
import { validate } from '@middlewares/validate';
import { idParamSchema, roleListQuerySchema, createRoleSchema, updateRoleSchema } from '@user/validators';

const router = Router();

const requireAdmin = [authenticate(ROLE_CODE.ADMIN), authorizeRoles(ROLE_CODE.ADMIN, ROLE_CODE.SUPER_ADMIN)];

router.get('/', ...requireAdmin, validate({ query: roleListQuerySchema }), roleController.list);
router.get('/:id', ...requireAdmin, validate({ params: idParamSchema }), roleController.getById);
router.post('/', ...requireAdmin, validate({ body: createRoleSchema }), roleController.create);
router.put('/:id', ...requireAdmin, validate({ params: idParamSchema, body: updateRoleSchema }), roleController.update);
router.patch('/:id/toggle-status', ...requireAdmin, validate({ params: idParamSchema }), roleController.toggleStatus);

export default router;
