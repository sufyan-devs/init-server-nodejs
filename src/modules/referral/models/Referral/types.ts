import type { Document, Model, Types } from 'mongoose';

export const REFERRAL_STATUS = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
  INACTIVE: 'INACTIVE',
} as const;

export type ReferralStatus = (typeof REFERRAL_STATUS)[keyof typeof REFERRAL_STATUS];

export interface IReferral extends Document {
  _id: Types.ObjectId;
  referrerId: Types.ObjectId;
  referredUserId: Types.ObjectId;
  referralCodeId: Types.ObjectId;
  codeUsed: string;
  roleAppliedFor: string;
  status: ReferralStatus;

  referredAt: Date;
  activatedAt: Date | null;
  rejectedAt: Date | null;
  suspendedAt: Date | null;
  inactivatedAt: Date | null;

  rejectionReason: string | null;
  suspensionReason: string | null;
  inactivationReason: string | null;

  createdAt: Date;
  updatedAt: Date;

  activate(): Promise<IReferral>;
  reject(reason?: string | null): Promise<IReferral>;
  suspend(reason?: string | null): Promise<IReferral>;
  unsuspend(): Promise<IReferral>;
  inactivate(reason?: string | null): Promise<IReferral>;
}

export interface IReferralModel extends Model<IReferral> {
  getReferrer(referredUserId: Types.ObjectId): ReturnType<Model<IReferral>['findOne']>;
  getActiveCount(referrerId: Types.ObjectId): Promise<number>;
}
