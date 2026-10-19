import type { Router } from 'express';
import adminCustomerRoutes from './routes/admin/customer';
import adminVendorRoutes from './routes/admin/vendor';
import adminAssociateRoutes from './routes/admin/associate';
import adminRoleRoutes from './routes/admin/role';
import customerProfileRoutes from './routes/customer/profile';
import vendorProfileRoutes from './routes/vendor/profile';
import associateProfileRoutes from './routes/associate/profile';
import { PORTAL } from '@utils/cookieHelper';

const register = (router: Router): void => {
  router.use(`/${PORTAL.ADMIN}/customers`, adminCustomerRoutes);
  router.use(`/${PORTAL.ADMIN}/vendors`, adminVendorRoutes);
  router.use(`/${PORTAL.ADMIN}/associates`, adminAssociateRoutes);
  router.use(`/${PORTAL.ADMIN}/roles`, adminRoleRoutes);
  router.use(`/${PORTAL.CUSTOMER}/profile`, customerProfileRoutes);
  router.use(`/${PORTAL.VENDOR}/profile`, vendorProfileRoutes);
  router.use(`/${PORTAL.ASSOCIATE}/profile`, associateProfileRoutes);
};

export { register };
