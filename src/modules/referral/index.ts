import type { Router } from 'express';
import associateReferralRoutes from './routes/associate/referral';

const register = (router: Router): void => {
  router.use('/associate/referrals', associateReferralRoutes);
};

export { register };
