import { Router } from 'express';
import * as authController from '@auth/controllers/admin';
import { authenticate, authorizeRoles } from '@auth/middlewares/authenticate';
import { ROLE_CODE } from '@user/models/Role';
import { loginRateLimit, otpRateLimit, otpVerifyRateLimit } from '@auth/routes/shared/limits';
import { verifyCsrf } from '@auth/middlewares/csrf';
import { validate } from '@middlewares/validate';
import { loginSchema, forgotPasswordSchema, otpSchema, resetPasswordSchema, switchRoleSchema, oauthSchema, sessionParamsSchema } from '@auth/validators';

const router = Router();

const requireAdmin = [authenticate(ROLE_CODE.ADMIN), authorizeRoles(ROLE_CODE.ADMIN, ROLE_CODE.SUPER_ADMIN)];

router.post('/login', loginRateLimit, validate({ body: loginSchema }), authController.login);
router.post('/forgot-password', otpRateLimit, validate({ body: forgotPasswordSchema }), authController.forgotPassword);
router.post('/verify-otp', otpVerifyRateLimit, validate({ body: otpSchema }), authController.verifyResetOtp);
router.post('/reset-password', otpVerifyRateLimit, validate({ body: resetPasswordSchema }), authController.resetPassword);
router.post('/logout', authenticate(ROLE_CODE.ADMIN), verifyCsrf, authController.logout);
router.post('/logout-all', ...requireAdmin, verifyCsrf, authController.logoutAll);
router.get('/me', ...requireAdmin, authController.getMe);
router.post('/switch-role', ...requireAdmin, verifyCsrf, validate({ body: switchRoleSchema }), authController.switchRole);

router.post('/oauth/:provider', loginRateLimit, validate({ body: oauthSchema }), authController.socialLogin);
router.get('/sessions', authenticate(ROLE_CODE.ADMIN), authController.listSessions);
router.delete('/sessions/:sid', authenticate(ROLE_CODE.ADMIN), verifyCsrf, validate({ params: sessionParamsSchema }), authController.revokeSessionById);

export default router;
