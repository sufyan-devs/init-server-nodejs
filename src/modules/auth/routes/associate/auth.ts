import { Router } from 'express';
import * as authController from '../../controllers/associate';
import { authenticate, authorizeRoles } from '@middlewares/authenticate';
import { ROLE_CODE } from '@user/models/Role';
import { loginRateLimit, registerRateLimit, otpRateLimit, otpVerifyRateLimit } from '../shared/limits';
import { verifyCsrf } from '@middlewares/csrf';
import { validate } from '@middlewares/validate';
import { loginSchema, registerSchema, forgotPasswordSchema, otpSchema, resetPasswordSchema, switchRoleSchema, requestRoleSchema, oauthSchema, sessionParamsSchema } from '@auth/validators';

const router = Router();

const requireBA = [authenticate(ROLE_CODE.BUSINESS_ASSOCIATE), authorizeRoles(ROLE_CODE.BUSINESS_ASSOCIATE)];

router.post('/register', registerRateLimit, validate({ body: registerSchema }), authController.register);
router.post('/login', loginRateLimit, validate({ body: loginSchema }), authController.login);
router.post('/logout', authenticate(ROLE_CODE.BUSINESS_ASSOCIATE), verifyCsrf, authController.logout);
router.post('/logout-all', ...requireBA, verifyCsrf, authController.logoutAll);
router.get('/me', ...requireBA, authController.getMe);
router.post('/switch-role', ...requireBA, verifyCsrf, validate({ body: switchRoleSchema }), authController.switchRole);
router.get('/roles', ...requireBA, authController.getAvailableRoles);
router.post('/request-role', authenticate(ROLE_CODE.BUSINESS_ASSOCIATE), verifyCsrf, validate({ body: requestRoleSchema }), authController.requestRole);
router.get('/referral-code', ...requireBA, authController.getReferralCode);
router.post('/verify-email', otpVerifyRateLimit, validate({ body: otpSchema }), authController.verifyEmailOTP);
router.post('/send-otp', otpRateLimit, validate({ body: forgotPasswordSchema }), authController.sendEmailOTP);
router.post('/forgot-password', otpRateLimit, validate({ body: forgotPasswordSchema }), authController.forgotPassword);
router.post('/verify-otp', otpVerifyRateLimit, validate({ body: otpSchema }), authController.verifyResetOTP);
router.post('/reset-password', otpVerifyRateLimit, validate({ body: resetPasswordSchema }), authController.resetPassword);

router.post('/oauth/:provider', loginRateLimit, validate({ body: oauthSchema }), authController.socialLogin);
router.get('/sessions', authenticate(ROLE_CODE.BUSINESS_ASSOCIATE), authController.listSessions);
router.delete('/sessions/:sid', authenticate(ROLE_CODE.BUSINESS_ASSOCIATE), verifyCsrf, validate({ params: sessionParamsSchema }), authController.revokeSessionById);

export default router;
