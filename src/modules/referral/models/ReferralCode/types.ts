import type { Document, Model, Types } from 'mongoose';

export const REFERRAL_CODE_TYPE = {
  CODE: 'CODE',
  LINK: 'LINK',
} as const;

export type ReferralCodeType = (typeof REFERRAL_CODE_TYPE)[keyof typeof REFERRAL_CODE_TYPE];

export interface IReferralCode extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: ReferralCodeType;
  code: string;
  totalUsed: number;
  successfulReferrals: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  incrementUsage(isSuccessful?: boolean): Promise<IReferralCode>;
}

export interface IReferralCodeModel extends Model<IReferralCode> {
  generateCode(): string;
  createForUser(userId: Types.ObjectId, type?: ReferralCodeType): Promise<IReferralCode>;
  findByCode(code: string): Promise<IReferralCode | null>;
  findByUserId(userId: Types.ObjectId): Promise<IReferralCode | null>;
}
