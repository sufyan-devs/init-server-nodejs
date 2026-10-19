import { Router } from 'express';
import { getProfile } from '@user/controllers/customer/profile';
import { updateProfile, uploadProfileImage, deleteProfileImage } from '@user/controllers/shared/profile';
import { authenticate, authorizeRoles } from '@auth/index';
import { ROLE_CODE } from '@user/models/Role';
import { uploadSingle } from '@user/helpers/upload';
import { validate } from '@middlewares/validate';
import { updateProfileSchema } from '@user/validators';

const router = Router();

const requireCustomer = [authenticate(ROLE_CODE.CUSTOMER), authorizeRoles(ROLE_CODE.CUSTOMER)];

router.get('/', ...requireCustomer, getProfile);
router.put('/', ...requireCustomer, validate({ body: updateProfileSchema }), updateProfile);
router.post('/image', ...requireCustomer, uploadSingle('file'), uploadProfileImage);
router.delete('/image', ...requireCustomer, deleteProfileImage);

export default router;
