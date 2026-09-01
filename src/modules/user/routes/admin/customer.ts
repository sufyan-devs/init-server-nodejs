import { Router } from 'express';
import * as customerController from '../../controllers/admin/customer';
import { authenticate, authorizeRoles } from '@middlewares/authenticate';
import { ROLE_CODE } from '@user/models/Role';
import { uploadSingle } from '@user/helpers/upload';

const router = Router();

const requireAdmin = [authenticate(ROLE_CODE.ADMIN), authorizeRoles(ROLE_CODE.ADMIN, ROLE_CODE.SUPER_ADMIN)];

router.get('/', ...requireAdmin, customerController.list);
router.get('/:id', ...requireAdmin, customerController.getById);
router.post('/', ...requireAdmin, uploadSingle('file'), customerController.create);
router.put('/:id', ...requireAdmin, customerController.update);
router.patch('/:id/toggle-status', ...requireAdmin, customerController.toggleStatus);
router.post('/:id/image', ...requireAdmin, uploadSingle('file'), customerController.uploadProfileImage);
router.delete('/:id/image', ...requireAdmin, customerController.deleteProfileImage);

export default router;
