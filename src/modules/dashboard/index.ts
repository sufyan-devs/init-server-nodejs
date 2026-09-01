import type { Router } from 'express';
import adminDashboardRoutes from './routes/admin/dashboard';
import vendorDashboardRoutes from './routes/vendor/dashboard';
import associateDashboardRoutes from './routes/associate/dashboard';

const register = (router: Router): void => {
  router.use('/admin/dashboard', adminDashboardRoutes);
  router.use('/vendor/dashboard', vendorDashboardRoutes);
  router.use('/associate/dashboard', associateDashboardRoutes);
};

export { register };
