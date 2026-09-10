import { Router } from 'express';
import * as profileController from '../../controllers/shared/profile';
import { authenticate, authorizeRoles } from '@middlewares/authenticate';
import { ROLE_CODE } from '@user/models/Role';
import { uploadSingle } from '@user/helpers/upload';
import { validate } from '@middlewares/validate';
import { updateProfileSchema } from '@user/validators';

const router = Router();

const requireBA = [authenticate(ROLE_CODE.BUSINESS_ASSOCIATE), authorizeRoles(ROLE_CODE.BUSINESS_ASSOCIATE)];

router.get('/', ...requireBA, profileController.getProfile);
router.put('/', ...requireBA, validate({ body: updateProfileSchema }), profileController.updateProfile);
router.post('/image', ...requireBA, uploadSingle('file'), profileController.uploadImage);
router.delete('/image', ...requireBA, profileController.deleteProfileImage);

export default router;
