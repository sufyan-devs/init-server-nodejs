import { Router } from 'express';
import * as roleController from '../../controllers/admin/role';
import { authenticate, authorizeRoles } from '@middlewares/authenticate';
import { ROLE_CODE } from '@user/models/Role';

const router = Router();

const requireAdmin = [authenticate(ROLE_CODE.ADMIN), authorizeRoles(ROLE_CODE.ADMIN, ROLE_CODE.SUPER_ADMIN)];

router.get('/', ...requireAdmin, roleController.list);
router.get('/:id', ...requireAdmin, roleController.getById);
router.post('/', ...requireAdmin, roleController.create);
router.put('/:id', ...requireAdmin, roleController.update);
router.patch('/:id/toggle-status', ...requireAdmin, roleController.toggleActive);

export default router;
