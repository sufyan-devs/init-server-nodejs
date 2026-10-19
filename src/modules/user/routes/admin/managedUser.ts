import { Router } from 'express';
import { makeManagedUserController, type ManagedUserLabels } from '@user/controllers/admin/managedUser';
import { authenticate, authorizeRoles } from '@middlewares/authenticate';
import { ROLE_CODE, type RoleCode } from '@user/models/Role';
import { uploadSingle } from '@user/helpers/upload';
import { validate } from '@middlewares/validate';
import {
  idParamSchema,
  createManagedUserSchema,
  updateProfileSchema,
  managedUserListQuerySchema,
} from '@user/validators';

const requireAdmin = [authenticate(ROLE_CODE.ADMIN), authorizeRoles(ROLE_CODE.ADMIN, ROLE_CODE.SUPER_ADMIN)];

export const makeManagedUserRouter = (
  roleCode: RoleCode,
  labels: ManagedUserLabels,
): Router => {
  const router = Router();
  const controller = makeManagedUserController(roleCode, labels);

  router.get('/', ...requireAdmin, validate({ query: managedUserListQuerySchema }), controller.list);
  router.get('/:id', ...requireAdmin, validate({ params: idParamSchema }), controller.getById);
  router.post('/', ...requireAdmin, uploadSingle('file'), validate({ body: createManagedUserSchema }), controller.create);
  router.put('/:id', ...requireAdmin, validate({ params: idParamSchema, body: updateProfileSchema }), controller.update);
  router.patch('/:id/toggle-status', ...requireAdmin, validate({ params: idParamSchema }), controller.toggleStatus);
  router.post('/:id/image', ...requireAdmin, validate({ params: idParamSchema }), uploadSingle('file'), controller.uploadProfileImage);
  router.delete('/:id/image', ...requireAdmin, validate({ params: idParamSchema }), controller.deleteProfileImage);

  return router;
};
