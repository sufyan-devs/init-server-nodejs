import type { Router } from 'express';
import { setSignupHook } from '@auth/index';
import './models/Referral';
import './models/ReferralCode';
import { referralSignupHook } from './signupHook';
import associateReferralRoutes from './routes/associate/referral';
import associateReferralCodeRoutes from './routes/associate/referralCode';
import vendorReferralCodeRoutes from './routes/vendor/referralCode';

setSignupHook(referralSignupHook);

const register = (router: Router): void => {
  router.use('/associate/referrals', associateReferralRoutes);
  router.use('/associate/auth', associateReferralCodeRoutes);
  router.use('/vendor/auth', vendorReferralCodeRoutes);
};

export { register };
