import mongoose, { Schema } from 'mongoose';
import { priceField } from '@utils/mongoHelper';
import type { ICoupon } from './types';
import { COUPON_STATUS, DISCOUNT_TYPE, REFERRAL_TYPE } from './types';

const couponSchema = new Schema<ICoupon>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      index: true,
    },
    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: 50,
      match: [
        /^[A-Z0-9_-]+$/,
        'Only letters, numbers, underscore and hyphen allowed',
      ],
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    referral: {
      type: {
        type: String,
        enum: Object.values(REFERRAL_TYPE),
        required: true,
        default: REFERRAL_TYPE.DIRECT,
      },
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
    },

    discount: {
      type: {
        type: String,
        enum: Object.values(DISCOUNT_TYPE),
        required: true,
      },
      value: priceField({
        required: true,
        validate: {
          validator: function (this: ICoupon, v: number) {
            return (
              this.discount.type === DISCOUNT_TYPE.FIXED ||
              (this.discount.type === DISCOUNT_TYPE.PERCENTAGE && v <= 100)
            );
          },
          message: 'Percentage discount cannot exceed 100%',
        },
      }),
    },
    minimumOrderValue: priceField({ default: 0 }),

    redeemLimit: {
      total: {
        type: Number,
        required: true,
        min: 1,
      },
      perUser: {
        type: Number,
        required: true,
        min: 1,
        default: 1,
      },
    },

    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
      validate: {
        validator: function (this: ICoupon, v: Date) {
          return v > this.startDate;
        },
        message: 'End date must be after start date',
      },
    },

    sellingPrice: priceField({ default: null }),

    status: {
      type: String,
      enum: Object.values(COUPON_STATUS),
      default: COUPON_STATUS.DRAFT,
      required: true,
      index: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      select: false,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  },
);

couponSchema.index({ userId: 1, code: 1 }, { unique: true });
couponSchema.index({ userId: 1, status: 1 });
couponSchema.index({ status: 1, startDate: 1, endDate: 1 });
couponSchema.index({ 'referral.userId': 1, status: 1 });

couponSchema.methods.submit = async function (this: ICoupon): Promise<ICoupon> {
  if (this.status !== COUPON_STATUS.DRAFT) {
    throw new Error(`Cannot submit coupon with status: ${this.status}`);
  }
  this.status = COUPON_STATUS.PENDING;
  return this.save();
};

couponSchema.methods.approve = async function (this: ICoupon): Promise<ICoupon> {
  if (this.status !== COUPON_STATUS.PENDING) {
    throw new Error(`Cannot approve coupon with status: ${this.status}`);
  }
  this.status = COUPON_STATUS.APPROVED;
  return this.save();
};

couponSchema.methods.publish = async function (this: ICoupon): Promise<ICoupon> {
  if (this.status !== COUPON_STATUS.APPROVED) {
    throw new Error(`Cannot publish coupon with status: ${this.status}`);
  }
  this.status = COUPON_STATUS.PUBLISHED;
  return this.save();
};

couponSchema.methods.reject = async function (this: ICoupon): Promise<ICoupon> {
  if (this.status !== COUPON_STATUS.PENDING) {
    throw new Error(`Cannot reject coupon with status: ${this.status}`);
  }
  this.status = COUPON_STATUS.DRAFT;
  return this.save();
};

couponSchema.methods.deactivate = async function (this: ICoupon): Promise<ICoupon> {
  if (this.status !== COUPON_STATUS.PUBLISHED) {
    throw new Error(`Cannot deactivate coupon with status: ${this.status}`);
  }
  this.status = COUPON_STATUS.INACTIVE;
  return this.save();
};

couponSchema.methods.markSoldOut = async function (this: ICoupon): Promise<ICoupon> {
  if (this.status !== COUPON_STATUS.PUBLISHED) {
    throw new Error(`Cannot mark sold out coupon with status: ${this.status}`);
  }
  this.status = COUPON_STATUS.SOLD_OUT;
  return this.save();
};

couponSchema.methods.toJSON = function (this: ICoupon) {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

const Coupon = mongoose.model<ICoupon>('Coupon', couponSchema);

export default Coupon;
