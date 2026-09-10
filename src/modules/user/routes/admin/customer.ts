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

const customerController = makeManagedUserController(ROLE_CODE.CUSTOMER, {
  itemKey: 'customer',
  listKey: 'customers',
  title: 'Customer',
  roleName: 'Customer',
});

const requireAdmin = [authenticate(ROLE_CODE.ADMIN), authorizeRoles(ROLE_CODE.ADMIN, ROLE_CODE.SUPER_ADMIN)];

router.get('/', ...requireAdmin, validate({ query: managedUserListQuerySchema }), customerController.list);
router.get('/:id', ...requireAdmin, validate({ params: idParamSchema }), customerController.getById);
router.post('/', ...requireAdmin, uploadSingle('file'), validate({ body: createManagedUserSchema }), customerController.create);
router.put('/:id', ...requireAdmin, validate({ params: idParamSchema, body: updateProfileSchema }), customerController.update);
router.patch('/:id/toggle-status', ...requireAdmin, validate({ params: idParamSchema }), customerController.toggleStatus);
router.post('/:id/image', ...requireAdmin, validate({ params: idParamSchema }), uploadSingle('file'), customerController.uploadProfileImage);
router.delete('/:id/image', ...requireAdmin, validate({ params: idParamSchema }), customerController.deleteProfileImage);

export default router;
