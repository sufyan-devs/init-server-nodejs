import type { Router } from 'express';
import associateDashboardRoutes from './routes/associate/dashboard';

const register = (router: Router): void => {
  router.use('/associate/dashboard', associateDashboardRoutes);
};

export { register };
