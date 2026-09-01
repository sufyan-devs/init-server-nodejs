import type { Types } from 'mongoose';
import mongoose, { Schema } from 'mongoose';
import type { IReferral, IReferralModel } from './types';
import { REFERRAL_STATUS } from './types';

const referralSchema = new Schema<IReferral>(
  {
    referrerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    referredUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },

    referralCodeId: {
      type: Schema.Types.ObjectId,
      ref: 'ReferralCode',
      required: true,
    },

    codeUsed: {
      type: String,
      required: true,
      index: true,
    },

    roleAppliedFor: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: Object.values(REFERRAL_STATUS),
      default: REFERRAL_STATUS.PENDING,
      index: true,
    },

    referredAt: {
      type: Date,
      default: Date.now,
    },
    activatedAt: Date,
    rejectedAt: Date,
    suspendedAt: Date,
    inactivatedAt: Date,

    rejectionReason: String,
    suspensionReason: String,
    inactivationReason: String,
  },
  {
    timestamps: true,
  },
);

referralSchema.index({ referrerId: 1, referredUserId: 1 }, { unique: true });
referralSchema.index({ status: 1, referrerId: 1 });

referralSchema.statics.getReferrer = function (referredUserId: Types.ObjectId) {
  return this.findOne({ referredUserId }).populate('referrerId', 'email firstName lastName');
};

referralSchema.statics.getActiveCount = function (referrerId: Types.ObjectId): Promise<number> {
  return this.countDocuments({ referrerId, status: REFERRAL_STATUS.ACTIVE });
};

referralSchema.methods.activate = async function (this: IReferral): Promise<IReferral> {
  if (this.status !== REFERRAL_STATUS.PENDING) {
    throw new Error(`Cannot activate referral with status: ${this.status}`);
  }
  this.status = REFERRAL_STATUS.ACTIVE;
  this.activatedAt = new Date();
  return this.save();
};

referralSchema.methods.reject = async function (
  this: IReferral,
  reason: string | null = null,
): Promise<IReferral> {
  if (this.status !== REFERRAL_STATUS.PENDING) {
    throw new Error(`Cannot reject referral with status: ${this.status}`);
  }
  this.status = REFERRAL_STATUS.REJECTED;
  this.rejectedAt = new Date();
  this.rejectionReason = reason ?? null;
  return this.save();
};

referralSchema.methods.suspend = async function (
  this: IReferral,
  reason: string | null = null,
): Promise<IReferral> {
  if (this.status !== REFERRAL_STATUS.ACTIVE) {
    throw new Error(`Cannot suspend referral with status: ${this.status}`);
  }
  this.status = REFERRAL_STATUS.SUSPENDED;
  this.suspendedAt = new Date();
  this.suspensionReason = reason;
  return this.save();
};

referralSchema.methods.unsuspend = async function (this: IReferral): Promise<IReferral> {
  if (this.status !== REFERRAL_STATUS.SUSPENDED) {
    throw new Error(`Cannot unsuspend referral with status: ${this.status}`);
  }
  this.status = REFERRAL_STATUS.ACTIVE;
  this.suspendedAt = null;
  this.suspensionReason = null;
  return this.save();
};

referralSchema.methods.inactivate = async function (
  this: IReferral,
  reason: string | null = null,
): Promise<IReferral> {
  if (this.status === REFERRAL_STATUS.INACTIVE) {
    throw new Error('Referral is already inactive');
  }
  this.status = REFERRAL_STATUS.INACTIVE;
  this.inactivatedAt = new Date();
  this.inactivationReason = reason ?? null;
  return this.save();
};

const Referral = mongoose.model<IReferral, IReferralModel>('Referral', referralSchema);

export default Referral;
