import type { Document, Model, Types } from 'mongoose';

export interface UserIdentity {
  provider: string;
  providerUserId: string;
  email?: string;
  linkedAt: Date;
}

export const USER_STATUS = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DELETED: 'DELETED',
} as const;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

export interface AuthUser {
  _id: Types.ObjectId;
  email: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  profileImage: string | null;
  activeRole: string;
  availableRoles: string[];
}

export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  emailVerified: boolean;
  passwordHash: string;
  // Shape and rationale: models/User/schema.ts, providers/types.ts.
  identities: UserIdentity[];
  status: UserStatus;
  firstName: string;
  lastName: string;
  phone: string | undefined;
  phoneVerified: boolean;
  dateOfBirth: Date | null;
  profileImage: string | null;
  createdAt: Date;
  updatedAt: Date;
  fullName: string;
  toAuthJSON(): Pick<AuthUser, '_id' | 'email' | 'firstName' | 'lastName' | 'emailVerified' | 'profileImage'> & { phone: string | null };
}

export interface IUserModel extends Model<IUser> {
  findByEmail(email: string): Promise<IUser | null>;
}
