import type { Document, Model, Types } from 'mongoose';

/** One linked login provider. Owned by user: it is a field on the document. */
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
  /**
   * Every way this account can sign in — password, Google, whatever is added
   * next. A new login method is a new entry here, never a new column, which is
   * what keeps future providers migration-free.
   * See modules/auth/providers/types.ts.
   */
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
