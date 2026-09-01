import type { Router } from 'express';
import adminCouponRoutes from './routes/admin/coupon';
import vendorCouponRoutes from './routes/vendor/coupon';
import customerCouponRoutes from './routes/customer/coupon';
import publicCouponRoutes from './routes/public/coupon';

const register = (router: Router): void => {
  router.use('/admin/coupons', adminCouponRoutes);
  router.use('/vendor/coupons', vendorCouponRoutes);
  router.use('/customer/coupons', customerCouponRoutes);
  router.use('/pub/coupons', publicCouponRoutes);
};

export { register };
