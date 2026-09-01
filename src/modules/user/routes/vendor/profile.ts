import { Router } from 'express';
import * as profileController from '../../controllers/vendor/profile';
import { authenticate, authorizeRoles } from '@middlewares/authenticate';
import { ROLE_CODE } from '@user/models/Role';
import { uploadSingle } from '@user/helpers/upload';

const router = Router();

const requireVendor = [authenticate(ROLE_CODE.VENDOR), authorizeRoles(ROLE_CODE.VENDOR)];

router.get('/', ...requireVendor, profileController.getProfile);
router.put('/', ...requireVendor, profileController.updateProfile);
router.post('/image', ...requireVendor, uploadSingle('file'), profileController.uploadImage);
router.delete('/image', ...requireVendor, profileController.deleteProfileImage);

export default router;
