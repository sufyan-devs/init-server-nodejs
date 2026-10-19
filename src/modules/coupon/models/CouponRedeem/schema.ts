import type { Types } from 'mongoose';
import mongoose, { Schema } from 'mongoose';
import crypto from 'crypto';
import { COUPON_REDEEM } from '@coupon/config';
import type { ICouponRedeem, ICouponRedeemModel, GenerateCodeData } from './types';
import { REDEEM_STATUS } from './types';

const couponRedeemSchema = new Schema<ICouponRedeem>(
  {
    purchaseId: {
      type: Schema.Types.ObjectId,
      ref: 'CouponPurchase',
      required: true,
      index: true,
    },
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

    redemptionCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: 50,
    },

    status: {
      type: String,
      enum: Object.values(REDEEM_STATUS),
      default: REDEEM_STATUS.ACTIVE,
      required: true,
      index: true,
    },

    redeemedQty: {
      type: Number,
      default: 1,
      min: 1,
    },

    otp: {
      hash: {
        type: String,
        default: null,
      },
      expiresAt: {
        type: Date,
        default: null,
      },
      verified: {
        type: Boolean,
        default: false,
      },
      attempts: {
        type: Number,
        default: 0,
      },
      sendCount: {
        type: Number,
        default: 0,
      },
      firstSentAt: {
        type: Date,
        default: null,
      },
      sentAt: {
        type: Date,
        default: null,
      },
    },

    redeemedAt: {
      type: Date,
      default: null,
    },
    redeemedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    orderReference: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

couponRedeemSchema.index(
  { redemptionCode: 1, purchaseId: 1, userId: 1, couponId: 1 },
  { unique: true },
);
couponRedeemSchema.index(
  { purchaseId: 1, userId: 1, couponId: 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE' } },
);
couponRedeemSchema.index({ purchaseId: 1, status: 1 });
couponRedeemSchema.index({ redeemedByUserId: 1, redeemedAt: -1 });

couponRedeemSchema.statics.generateRedemptionCode = function (): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `DD-${timestamp}-${random}`;
};

couponRedeemSchema.statics.generateOTP = function (): string {
  return crypto.randomInt(100000, 999999).toString();
};

couponRedeemSchema.statics.generateCode = async function (
  data: GenerateCodeData,
): Promise<ICouponRedeem> {
  const { purchaseId, couponId, userId, purchasedQty } = data;

  const activeCode = await this.findOne({
    purchaseId,
    status: REDEEM_STATUS.ACTIVE,
  });

  if (activeCode) {
    throw new Error(
      'You already have an active redeem code. Use or cancel it before generating a new one',
    );
  }

  const consumed = await this.aggregate([
    { $match: { purchaseId, status: REDEEM_STATUS.REDEEMED } },
    { $group: { _id: null, total: { $sum: '$redeemedQty' } } },
  ]);
  const totalRedeemed = consumed[0]?.total || 0;

  if (totalRedeemed >= purchasedQty) {
    throw new Error('All purchased quantities have been redeemed');
  }

  return this.create({
    purchaseId,
    couponId,
    userId,
    redemptionCode: (this as ICouponRedeemModel).generateRedemptionCode(),
    status: REDEEM_STATUS.ACTIVE,
  });
};

couponRedeemSchema.methods.sendOTP = async function (this: ICouponRedeem): Promise<string> {
  if (this.status !== REDEEM_STATUS.ACTIVE) {
    throw new Error(`Cannot initiate OTP for code with status: ${this.status}`);
  }

  const maxSends = COUPON_REDEEM.SEND_MAX_REQUESTS;
  const windowMs = COUPON_REDEEM.SEND_WINDOW_MINUTES * 60 * 1000;

  if (this.otp.firstSentAt && Date.now() - this.otp.firstSentAt.getTime() > windowMs) {
    this.otp.sendCount = 0;
    this.otp.firstSentAt = null;
  }

  if (this.otp.sendCount >= maxSends) {
    const waitMs = this.otp.firstSentAt
      ? this.otp.firstSentAt.getTime() + windowMs - Date.now()
      : 0;
    const waitSeconds = Math.max(0, Math.ceil(waitMs / 1000));
    const err: any = new Error(
      waitSeconds >= 60
        ? `Too many OTP requests. Please wait ${Math.ceil(waitSeconds / 60)} minute(s) before requesting again.`
        : `Too many OTP requests. Please wait ${waitSeconds} second(s) before requesting again.`,
    );
    err.waitSeconds = waitSeconds;
    err.statusCode = 429;
    throw err;
  }

  const otpCode = (mongoose.model('CouponRedeem') as ICouponRedeemModel).generateOTP();

  this.otp.hash = otpCode;
  this.otp.expiresAt = new Date(
    Date.now() + COUPON_REDEEM.OTP_EXPIRY_MINUTES * 60 * 1000,
  );
  this.otp.verified = false;
  this.otp.attempts = 0;
  this.otp.sendCount += 1;
  if (!this.otp.firstSentAt) this.otp.firstSentAt = new Date();
  this.otp.sentAt = new Date();

  await this.save();
  return otpCode;
};

couponRedeemSchema.methods.verifyOTP = async function (
  this: ICouponRedeem,
  inputOtp: string,
): Promise<ICouponRedeem> {
  if (this.status !== REDEEM_STATUS.ACTIVE) {
    throw new Error('Invalid redemption session');
  }

  if (!this.otp.hash || !this.otp.expiresAt) {
    throw new Error('OTP has not been sent yet');
  }

  if (this.otp.expiresAt < new Date()) {
    this.otp.hash = null;
    this.otp.expiresAt = null;
    await this.save();
    throw new Error('OTP has expired');
  }

  this.otp.attempts += 1;

  if (this.otp.attempts > COUPON_REDEEM.VERIFY_MAX_ATTEMPTS) {
    this.otp.hash = null;
    this.otp.expiresAt = null;
    await this.save();
    throw new Error('Too many failed attempts. Please request a new OTP');
  }

  if (this.otp.hash !== inputOtp) {
    await this.save();
    const remaining = COUPON_REDEEM.VERIFY_MAX_ATTEMPTS - this.otp.attempts;
    throw new Error(`Invalid OTP. ${remaining} attempt(s) remaining.`);
  }

  this.otp.verified = true;
  this.otp.hash = null;
  await this.save();

  return this;
};

couponRedeemSchema.methods.redeem = async function (
  this: ICouponRedeem,
  vendorId: Types.ObjectId,
  { redeemQty = 1, orderReference = null }: { redeemQty?: number; orderReference?: string | null } = {},
): Promise<ICouponRedeem> {
  if (this.status !== REDEEM_STATUS.ACTIVE) {
    throw new Error('Invalid redemption session');
  }

  if (!this.otp.verified) {
    throw new Error('OTP has not been verified yet');
  }

  this.status = REDEEM_STATUS.REDEEMED;
  this.redeemedQty = redeemQty;
  this.redeemedAt = new Date();
  this.redeemedByUserId = vendorId;
  this.orderReference = orderReference || null;

  return this.save();
};

couponRedeemSchema.methods.toJSON = function (this: ICouponRedeem) {
  const obj = this.toObject();
  if (obj.otp) {
    delete obj.otp.hash;
  }
  delete obj.__v;
  return obj;
};

const CouponRedeem = mongoose.model<ICouponRedeem, ICouponRedeemModel>(
  'CouponRedeem',
  couponRedeemSchema,
);

export default CouponRedeem;
