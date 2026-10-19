import type { Document, Model, Types } from 'mongoose';

export const USER_ROLE_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
  REVOKED: 'REVOKED',
} as const;

export type UserRoleStatus = (typeof USER_ROLE_STATUS)[keyof typeof USER_ROLE_STATUS];

export interface IUserRole extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  roleId: Types.ObjectId;
  roleCode: string;
  status: UserRoleStatus;
  isActive: boolean;

  requestedAt: Date;
  requestedBy: Types.ObjectId;

  approvedAt?: Date;
  approvedBy?: Types.ObjectId;

  rejectedAt?: Date;
  rejectedBy?: Types.ObjectId;
  rejectionReason?: string;

  suspendedAt?: Date | null;
  suspendedBy?: Types.ObjectId | null;
  suspensionReason?: string | null;

  revokedAt?: Date;
  revokedBy?: Types.ObjectId;
  revocationReason?: string;

  createdAt: Date;
  updatedAt: Date;
}

export interface AssignRoleOptions {
  requestedBy?: Types.ObjectId;
  autoApprove?: boolean;
  approvedBy?: Types.ObjectId;
}

export interface IUserRoleModel extends Model<IUserRole> {
  getUserActiveRoles(userId: Types.ObjectId): ReturnType<Model<IUserRole>['find']>;
  getUserRoleCodes(userId: Types.ObjectId): Promise<string[]>;
  assignRole(userId: Types.ObjectId, roleCode: string, options?: AssignRoleOptions): Promise<IUserRole>;
}
