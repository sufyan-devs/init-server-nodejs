import { Router } from 'express';
import * as vendorController from '../../controllers/admin/vendor';
import { authenticate, authorizeRoles } from '@middlewares/authenticate';
import { ROLE_CODE } from '@user/models/Role';
import { uploadSingle } from '@user/helpers/upload';

const router = Router();

const requireAdmin = [authenticate(ROLE_CODE.ADMIN), authorizeRoles(ROLE_CODE.ADMIN, ROLE_CODE.SUPER_ADMIN)];

router.get('/', ...requireAdmin, vendorController.list);
router.get('/:id', ...requireAdmin, vendorController.getById);
router.post('/', ...requireAdmin, uploadSingle('file'), vendorController.create);
router.put('/:id', ...requireAdmin, vendorController.update);
router.patch('/:id/toggle-status', ...requireAdmin, vendorController.toggleStatus);
router.post('/:id/image', ...requireAdmin, uploadSingle('file'), vendorController.uploadProfileImage);
router.delete('/:id/image', ...requireAdmin, vendorController.deleteProfileImage);

export default router;
