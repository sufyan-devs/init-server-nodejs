import { Router } from 'express';
import * as associateController from '../../controllers/admin/associate';
import { authenticate, authorizeRoles } from '@middlewares/authenticate';
import { ROLE_CODE } from '@user/models/Role';
import { uploadSingle } from '@user/helpers/upload';

const router = Router();

const requireAdmin = [authenticate(ROLE_CODE.ADMIN), authorizeRoles(ROLE_CODE.ADMIN, ROLE_CODE.SUPER_ADMIN)];

router.get('/', ...requireAdmin, associateController.list);
router.get('/:id', ...requireAdmin, associateController.getById);
router.post('/', ...requireAdmin, uploadSingle('file'), associateController.create);
router.put('/:id', ...requireAdmin, associateController.update);
router.patch('/:id/toggle-status', ...requireAdmin, associateController.toggleStatus);
router.post('/:id/image', ...requireAdmin, uploadSingle('file'), associateController.uploadProfileImage);
router.delete('/:id/image', ...requireAdmin, associateController.deleteProfileImage);

export default router;
