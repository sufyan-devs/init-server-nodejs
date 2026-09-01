import type { Router } from 'express';
import adminCustomerRoutes from './routes/admin/customer';
import adminVendorRoutes from './routes/admin/vendor';
import adminAssociateRoutes from './routes/admin/associate';
import adminRoleRoutes from './routes/admin/role';
import customerProfileRoutes from './routes/customer/profile';
import vendorProfileRoutes from './routes/vendor/profile';
import associateProfileRoutes from './routes/associate/profile';

const register = (router: Router): void => {
  router.use('/admin/customers', adminCustomerRoutes);
  router.use('/admin/vendors', adminVendorRoutes);
  router.use('/admin/associates', adminAssociateRoutes);
  router.use('/admin/roles', adminRoleRoutes);
  router.use('/customer/profile', customerProfileRoutes);
  router.use('/vendor/profile', vendorProfileRoutes);
  router.use('/associate/profile', associateProfileRoutes);
};

export { register };
