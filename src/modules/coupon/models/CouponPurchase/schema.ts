import mongoose, { Schema } from 'mongoose';
import { priceField } from '@coupon/helpers/mongo';
import type { ICouponPurchase } from './types';
import { PAYMENT_STATUS, PAYMENT_METHOD } from './types';

const couponPurchaseSchema = new Schema<ICouponPurchase>(
  {
    couponId: {
      type: Schema.Types.ObjectId,
      ref: 'Coupon',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },

    unitPrice: priceField({ required: true }),
    totalAmount: priceField({ required: true }),

    snapshot: {
      title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
      },
      code: {
        type: String,
        required: true,
        trim: true,
        maxlength: 50,
      },
      discount: {
        type: {
          type: String,
          enum: ['PERCENTAGE', 'FIXED'],
          required: true,
        },
        value: priceField({ required: true }),
      },
      sellingPrice: priceField({ required: true }),
      minimumOrderValue: priceField({ default: 0 }),
      startDate: {
        type: Date,
        required: true,
      },
      endDate: {
        type: Date,
        required: true,
      },
      description: {
        type: String,
        trim: true,
        maxlength: 500,
      },
    },

    payment: {
      status: {
        type: String,
        enum: Object.values(PAYMENT_STATUS),
        default: PAYMENT_STATUS.PENDING,
      },
      transactionId: {
        type: String,
        default: null,
      },
      method: {
        type: String,
        enum: Object.values(PAYMENT_METHOD),
        default: null,
      },
    },

    purchasedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  },
);

couponPurchaseSchema.index({ couponId: 1, userId: 1 });
couponPurchaseSchema.index({ userId: 1, 'payment.status': 1, purchasedAt: -1 });

couponPurchaseSchema.methods.toJSON = function (this: ICouponPurchase) {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

const CouponPurchase = mongoose.model<ICouponPurchase>('CouponPurchase', couponPurchaseSchema);

export default CouponPurchase;
