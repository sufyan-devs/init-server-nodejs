import mongoose, { Schema } from 'mongoose';
import type { IRole, IRoleModel } from './types';
import { ROLE_TYPE, ROLE_CODE } from './types';

const roleSchema = new Schema<IRole>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      enum: Object.values(ROLE_CODE),
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    roleType: {
      type: String,
      required: true,
      enum: Object.values(ROLE_TYPE),
      index: true,
    },
    canSelfRegister: {
      type: Boolean,
      default: false,
    },
    autoApproveOnSignup: {
      type: Boolean,
      default: false,
    },
    emailVerificationRequired: {
      type: Boolean,
      default: false,
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

roleSchema.statics.findByCode = function (code: string) {
  return this.findOne({ code, isActive: true });
};

const Role = mongoose.model<IRole, IRoleModel>('Role', roleSchema);

export default Role;
