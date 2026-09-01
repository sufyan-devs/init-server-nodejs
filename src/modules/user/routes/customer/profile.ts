import { Router } from 'express';
import * as profileController from '../../controllers/customer/profile';
import { authenticate, authorizeRoles } from '@middlewares/authenticate';
import { ROLE_CODE } from '@user/models/Role';
import { uploadSingle } from '@user/helpers/upload';

const router = Router();

const requireCustomer = [authenticate(ROLE_CODE.CUSTOMER), authorizeRoles(ROLE_CODE.CUSTOMER)];

router.get('/', ...requireCustomer, profileController.getProfile);
router.put('/', ...requireCustomer, profileController.updateProfile);
router.post('/image', ...requireCustomer, uploadSingle('file'), profileController.uploadImage);
router.delete('/image', ...requireCustomer, profileController.deleteProfileImage);

export default router;
