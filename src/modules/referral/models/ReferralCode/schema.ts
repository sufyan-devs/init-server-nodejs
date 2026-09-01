import type { Types } from 'mongoose';
import mongoose, { Schema } from 'mongoose';
import type { IReferralCode, IReferralCodeModel, ReferralCodeType } from './types';
import { REFERRAL_CODE_TYPE } from './types';

const referralCodeSchema = new Schema<IReferralCode>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    type: {
      type: String,
      enum: Object.values(REFERRAL_CODE_TYPE),
      default: REFERRAL_CODE_TYPE.CODE,
    },

    code: {
      type: String,
      required: true,
      unique: true,
    },

    totalUsed: {
      type: Number,
      default: 0,
    },
    successfulReferrals: {
      type: Number,
      default: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

referralCodeSchema.statics.generateCode = function (): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'REF-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

referralCodeSchema.statics.createForUser = async function (
  userId: Types.ObjectId,
  type: ReferralCodeType = REFERRAL_CODE_TYPE.CODE,
): Promise<IReferralCode> {
  let code: string;
  let isUnique = false;

  while (!isUnique) {
    code = (this as IReferralCodeModel).generateCode();
    const existing = await this.findOne({ code });
    if (!existing) isUnique = true;
  }

  return this.create({ userId, code: code!, type });
};

referralCodeSchema.statics.findByCode = function (code: string) {
  return this.findOne({ code, isActive: true }).populate('userId', 'email firstName lastName');
};

referralCodeSchema.statics.findByUserId = function (userId: Types.ObjectId) {
  return this.findOne({ userId, isActive: true });
};

referralCodeSchema.methods.incrementUsage = async function (
  this: IReferralCode,
  isSuccessful: boolean = false,
): Promise<IReferralCode> {
  this.totalUsed += 1;
  if (isSuccessful) this.successfulReferrals += 1;
  return this.save();
};

const ReferralCode = mongoose.model<IReferralCode, IReferralCodeModel>(
  'ReferralCode',
  referralCodeSchema,
);

export default ReferralCode;
