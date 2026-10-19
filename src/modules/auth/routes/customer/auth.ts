import { Router } from 'express';
import * as authController from '@auth/controllers/customer';
import { authenticate, authorizeRoles } from '@auth/middlewares/authenticate';
import { ROLE_CODE } from '@user/models/Role';
import { loginRateLimit, registerRateLimit, otpRateLimit, otpVerifyRateLimit } from '@auth/routes/shared/limits';
import { verifyCsrf } from '@auth/middlewares/csrf';
import { validate } from '@middlewares/validate';
import { loginSchema, registerSchema, forgotPasswordSchema, otpSchema, resetPasswordSchema, oauthSchema, sessionParamsSchema } from '@auth/validators';

const router = Router();

const requireCustomer = [authenticate(ROLE_CODE.CUSTOMER), authorizeRoles(ROLE_CODE.CUSTOMER)];

router.post('/register', registerRateLimit, validate({ body: registerSchema }), authController.register);
router.post('/login', loginRateLimit, validate({ body: loginSchema }), authController.login);
router.post('/verify-email', otpVerifyRateLimit, validate({ body: otpSchema }), authController.verifyEmailOtp);
router.post('/send-otp', otpRateLimit, validate({ body: forgotPasswordSchema }), authController.sendEmailOtp);
router.post('/forgot-password', otpRateLimit, validate({ body: forgotPasswordSchema }), authController.forgotPassword);
router.post('/verify-otp', otpVerifyRateLimit, validate({ body: otpSchema }), authController.verifyResetOtp);
router.post('/reset-password', otpVerifyRateLimit, validate({ body: resetPasswordSchema }), authController.resetPassword);
router.post('/logout', authenticate(ROLE_CODE.CUSTOMER), verifyCsrf, authController.logout);
router.post('/logout-all', ...requireCustomer, verifyCsrf, authController.logoutAll);
router.get('/me', ...requireCustomer, authController.getMe);

router.post('/oauth/:provider', loginRateLimit, validate({ body: oauthSchema }), authController.socialLogin);
router.get('/sessions', authenticate(ROLE_CODE.CUSTOMER), authController.listSessions);
router.delete('/sessions/:sid', authenticate(ROLE_CODE.CUSTOMER), verifyCsrf, validate({ params: sessionParamsSchema }), authController.revokeSessionById);

export default router;
