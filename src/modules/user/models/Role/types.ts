import type { Document, Model, Types } from 'mongoose';

export const ROLE_TYPE = {
  SYSTEM: 'SYSTEM',
  APPLICATION: 'APPLICATION',
} as const;

export type RoleType = (typeof ROLE_TYPE)[keyof typeof ROLE_TYPE];

export const ROLE_CODE = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  BUSINESS_ASSOCIATE: 'BUSINESS_ASSOCIATE',
  VENDOR: 'VENDOR',
  CUSTOMER: 'CUSTOMER',
} as const;

export type RoleCode = (typeof ROLE_CODE)[keyof typeof ROLE_CODE];

export interface IRole extends Document {
  _id: Types.ObjectId;
  code: RoleCode;
  name: string;
  description?: string;
  roleType: RoleType;
  canSelfRegister: boolean;
  autoApproveOnSignup: boolean;
  emailVerificationRequired: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRoleModel extends Model<IRole> {
  findByCode(code: string): Promise<IRole | null>;
}
