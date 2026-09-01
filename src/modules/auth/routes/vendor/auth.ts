import { Router } from 'express';
import * as authController from '../../controllers/vendor';
import { authenticate, authorizeRoles } from '@middlewares/authenticate';
import { ROLE_CODE } from '@user/models/Role';
import { loginRateLimit, registerRateLimit, otpRateLimit, otpVerifyRateLimit } from '../shared/limits';
import { verifyCsrf } from '@middlewares/csrf';
import { validate } from '@middlewares/validate';
import { loginSchema, registerSchema, forgotPasswordSchema, otpSchema, resetPasswordSchema, switchRoleSchema, requestRoleSchema, oauthSchema, sessionParamsSchema } from '@auth/validators';

const router = Router();

const requireVendor = [authenticate(ROLE_CODE.VENDOR), authorizeRoles(ROLE_CODE.VENDOR)];

router.post('/register', registerRateLimit, validate({ body: registerSchema }), authController.register);
router.post('/login', loginRateLimit, validate({ body: loginSchema }), authController.login);
router.post('/logout', authenticate(ROLE_CODE.VENDOR), verifyCsrf, authController.logout);
router.post('/logout-all', ...requireVendor, verifyCsrf, authController.logoutAll);
router.get('/me', ...requireVendor, authController.getMe);
router.post('/switch-role', ...requireVendor, verifyCsrf, validate({ body: switchRoleSchema }), authController.switchRole);
router.get('/roles', ...requireVendor, authController.getAvailableRoles);
router.post('/request-role', authenticate(ROLE_CODE.VENDOR), verifyCsrf, validate({ body: requestRoleSchema }), authController.requestRole);
router.get('/referral-code', ...requireVendor, authController.getReferralCode);
router.post('/verify-email', otpVerifyRateLimit, validate({ body: otpSchema }), authController.verifyEmailOTP);
router.post('/send-otp', otpRateLimit, validate({ body: forgotPasswordSchema }), authController.sendEmailOTP);
router.post('/forgot-password', otpRateLimit, validate({ body: forgotPasswordSchema }), authController.forgotPassword);
router.post('/verify-otp', otpVerifyRateLimit, validate({ body: otpSchema }), authController.verifyResetOTP);
router.post('/reset-password', otpVerifyRateLimit, validate({ body: resetPasswordSchema }), authController.resetPassword);

router.post('/oauth/:provider', loginRateLimit, validate({ body: oauthSchema }), authController.socialLogin);
router.get('/sessions', authenticate(ROLE_CODE.VENDOR), authController.listSessions);
router.delete('/sessions/:sid', authenticate(ROLE_CODE.VENDOR), verifyCsrf, validate({ params: sessionParamsSchema }), authController.revokeSessionById);

export default router;
