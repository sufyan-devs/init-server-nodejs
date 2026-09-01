import type { Document, Types } from 'mongoose';
import type { DiscountType } from '../Coupon';

export const PAYMENT_STATUS = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
} as const;

export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

export const PAYMENT_METHOD = {
  STRIPE: 'stripe',
  PAYPAL: 'paypal',
  WALLET: 'wallet',
  OTHER: 'other',
} as const;

export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];

export interface ICouponPurchase extends Document {
  _id: Types.ObjectId;
  couponId: Types.ObjectId;
  userId: Types.ObjectId;

  quantity: number;

  unitPrice: Types.Decimal128;
  totalAmount: Types.Decimal128;

  snapshot: {
    title: string;
    code: string;
    discount: {
      type: DiscountType;
      value: Types.Decimal128;
    };
    sellingPrice: Types.Decimal128;
    minimumOrderValue: Types.Decimal128;
    startDate: Date;
    endDate: Date;
    description?: string;
  };

  payment: {
    status: PaymentStatus;
    transactionId: string | null;
    method: PaymentMethod | null;
  };

  purchasedAt: Date;

  createdAt: Date;
  updatedAt: Date;
}
