import mongoose, { Schema } from 'mongoose';
import type { IUser, IUserModel } from './types';
import { USER_STATUS } from './types';

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    emailVerified: { type: Boolean, default: false },
    /**
     * Required only while the account has no other way in. Accounts created
     * through a provider (Google, and anything added later) carry no password
     * hash at all, so `required: true` would reject them.
     */
    passwordHash: {
      type: String,
      required: function (this: IUser) {
        return !this.identities || this.identities.length === 0;
      },
    },
    /**
     * One entry per linked login method. Adding a provider adds a row here —
     * never a new field — so no future provider needs a migration.
     * Shape: modules/auth/providers/types.ts `UserIdentity`.
     */
    identities: [
      {
        provider: { type: String, required: true, trim: true },
        providerUserId: { type: String, required: true, trim: true },
        email: { type: String, lowercase: true, trim: true },
        linkedAt: { type: Date, default: Date.now },
      },
    ],
    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.ACTIVE,
      index: true,
    },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    phone: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    phoneVerified: { type: Boolean, default: false },
    dateOfBirth: { type: Date, default: null },
    profileImage: { type: String, default: null },
  },
  { timestamps: true },
);

userSchema.index({ status: 1, createdAt: -1 });

/**
 * One provider account can belong to exactly one user, and users without any
 * linked identity are left out of the index entirely (sparse). This is also the
 * index the login funnel reads on every provider sign-in.
 */
userSchema.index(
  { 'identities.provider': 1, 'identities.providerUserId': 1 },
  { unique: true, sparse: true },
);

userSchema.virtual('fullName').get(function (this: IUser) {
  return `${this.firstName} ${this.lastName}`;
});

userSchema.statics.findByEmail = function (email: string) {
  return this.findOne({ email: email.toLowerCase() });
};

userSchema.methods.toJSON = function (this: IUser) {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.__v;
  return obj;
};

userSchema.methods.toAuthJSON = function (this: IUser) {
  return {
    _id: this._id,
    email: this.email,
    firstName: this.firstName,
    lastName: this.lastName,
    phone: this.phone || null,
    emailVerified: this.emailVerified,
    profileImage: this.profileImage,
  };
};

const User = mongoose.model<IUser, IUserModel>('User', userSchema);

export default User;
