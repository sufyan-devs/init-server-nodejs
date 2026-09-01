import type { Document, Types } from 'mongoose';

export const COUPON_STATUS = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  INACTIVE: 'INACTIVE',
  EXPIRED: 'EXPIRED',
  SOLD_OUT: 'SOLD_OUT',
} as const;

export type CouponStatus = (typeof COUPON_STATUS)[keyof typeof COUPON_STATUS];

export const DISCOUNT_TYPE = {
  PERCENTAGE: 'PERCENTAGE',
  FIXED: 'FIXED',
} as const;

export type DiscountType = (typeof DISCOUNT_TYPE)[keyof typeof DISCOUNT_TYPE];

export const REFERRAL_TYPE = {
  DIRECT: 'DIRECT',
  REFERRAL: 'REFERRAL',
} as const;

export type CouponReferralType = (typeof REFERRAL_TYPE)[keyof typeof REFERRAL_TYPE];

export interface ICoupon extends Document {
  _id: Types.ObjectId;
  title: string;
  code: string;
  description?: string;

  userId: Types.ObjectId;
  referral: {
    type: CouponReferralType;
    userId: Types.ObjectId | null;
  };

  discount: {
    type: DiscountType;
    value: Types.Decimal128;
  };
  minimumOrderValue: Types.Decimal128;

  redeemLimit: {
    total: number;
    perUser: number;
  };

  startDate: Date;
  endDate: Date;

  sellingPrice: Types.Decimal128 | null;

  status: CouponStatus;
  isDeleted: boolean;

  createdAt: Date;
  updatedAt: Date;

  submit(): Promise<ICoupon>;
  approve(): Promise<ICoupon>;
  publish(): Promise<ICoupon>;
  reject(): Promise<ICoupon>;
  deactivate(): Promise<ICoupon>;
  markSoldOut(): Promise<ICoupon>;
}
