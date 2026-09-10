import { Router } from 'express';
import { makeManagedUserController } from '../../controllers/admin/managedUser';
import { authenticate, authorizeRoles } from '@middlewares/authenticate';
import { ROLE_CODE } from '@user/models/Role';
import { uploadSingle } from '@user/helpers/upload';
import { validate } from '@middlewares/validate';
import {
  idParamSchema,
  createManagedUserSchema,
  updateProfileSchema,
  managedUserListQuerySchema,
} from '@user/validators';

const router = Router();

const vendorController = makeManagedUserController(ROLE_CODE.VENDOR, {
  itemKey: 'vendor',
  listKey: 'vendors',
  title: 'Vendor',
  roleName: 'Vendor',
});

const requireAdmin = [authenticate(ROLE_CODE.ADMIN), authorizeRoles(ROLE_CODE.ADMIN, ROLE_CODE.SUPER_ADMIN)];

router.get('/', ...requireAdmin, validate({ query: managedUserListQuerySchema }), vendorController.list);
router.get('/:id', ...requireAdmin, validate({ params: idParamSchema }), vendorController.getById);
router.post('/', ...requireAdmin, uploadSingle('file'), validate({ body: createManagedUserSchema }), vendorController.create);
router.put('/:id', ...requireAdmin, validate({ params: idParamSchema, body: updateProfileSchema }), vendorController.update);
router.patch('/:id/toggle-status', ...requireAdmin, validate({ params: idParamSchema }), vendorController.toggleStatus);
router.post('/:id/image', ...requireAdmin, validate({ params: idParamSchema }), uploadSingle('file'), vendorController.uploadProfileImage);
router.delete('/:id/image', ...requireAdmin, validate({ params: idParamSchema }), vendorController.deleteProfileImage);

export default router;
