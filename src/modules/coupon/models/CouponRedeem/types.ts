import type { Document, Model, Types } from 'mongoose';

export const REDEEM_STATUS = {
  ACTIVE: 'ACTIVE',
  REDEEMED: 'REDEEMED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;

export type RedeemStatus = (typeof REDEEM_STATUS)[keyof typeof REDEEM_STATUS];

export interface ICouponRedeem extends Document {
  _id: Types.ObjectId;
  purchaseId: Types.ObjectId;
  couponId: Types.ObjectId;
  userId: Types.ObjectId;

  redemptionCode: string;

  status: RedeemStatus;

  redeemedQty: number;

  otp: {
    hash: string | null;
    expiresAt: Date | null;
    verified: boolean;
    attempts: number;
    sendCount: number;
    firstSentAt: Date | null;
    sentAt: Date | null;
  };

  redeemedAt: Date | null;
  redeemedByUserId: Types.ObjectId | null;
  orderReference: string | null;

  createdAt: Date;
  updatedAt: Date;

  sendOTP(): Promise<string>;
  verifyOTP(inputOtp: string): Promise<ICouponRedeem>;
  redeem(
    vendorId: Types.ObjectId,
    options?: { redeemQty?: number; orderReference?: string | null },
  ): Promise<ICouponRedeem>;
}

export interface GenerateCodeData {
  purchaseId: Types.ObjectId;
  couponId: Types.ObjectId;
  userId: Types.ObjectId;
  purchasedQty: number;
}

export interface ICouponRedeemModel extends Model<ICouponRedeem> {
  generateRedemptionCode(): string;
  generateOTP(): string;
  generateCode(data: GenerateCodeData): Promise<ICouponRedeem>;
}
