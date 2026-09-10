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

const associateController = makeManagedUserController(ROLE_CODE.BUSINESS_ASSOCIATE, {
  itemKey: 'associate',
  listKey: 'associates',
  title: 'Associate',
  roleName: 'Business Associate',
});

const requireAdmin = [authenticate(ROLE_CODE.ADMIN), authorizeRoles(ROLE_CODE.ADMIN, ROLE_CODE.SUPER_ADMIN)];

router.get('/', ...requireAdmin, validate({ query: managedUserListQuerySchema }), associateController.list);
router.get('/:id', ...requireAdmin, validate({ params: idParamSchema }), associateController.getById);
router.post('/', ...requireAdmin, uploadSingle('file'), validate({ body: createManagedUserSchema }), associateController.create);
router.put('/:id', ...requireAdmin, validate({ params: idParamSchema, body: updateProfileSchema }), associateController.update);
router.patch('/:id/toggle-status', ...requireAdmin, validate({ params: idParamSchema }), associateController.toggleStatus);
router.post('/:id/image', ...requireAdmin, validate({ params: idParamSchema }), uploadSingle('file'), associateController.uploadProfileImage);
router.delete('/:id/image', ...requireAdmin, validate({ params: idParamSchema }), associateController.deleteProfileImage);

export default router;
