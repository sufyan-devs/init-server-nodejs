import type { Types } from 'mongoose';
import mongoose, { Schema } from 'mongoose';
import Role, { ROLE_CODE } from '@user/models/Role';
import type { IUserRole, IUserRoleModel, AssignRoleOptions } from './types';
import { USER_ROLE_STATUS } from './types';

const userRoleSchema = new Schema<IUserRole>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    roleId: {
      type: Schema.Types.ObjectId,
      ref: 'Role',
      required: true,
    },
    roleCode: {
      type: String,
      required: true,
      enum: Object.values(ROLE_CODE),
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(USER_ROLE_STATUS),
      default: USER_ROLE_STATUS.PENDING,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: false,
      index: true,
    },

    requestedAt: { type: Date, default: Date.now },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    approvedAt: Date,
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    rejectedAt: Date,
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectionReason: String,

    suspendedAt: Date,
    suspendedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    suspensionReason: String,

    revokedAt: Date,
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    revocationReason: String,
  },
  {
    timestamps: true,
  },
);

userRoleSchema.index({ userId: 1, roleCode: 1 }, { unique: true });
userRoleSchema.index({ userId: 1, status: 1, isActive: 1 });

userRoleSchema.statics.getUserActiveRoles = function (userId: Types.ObjectId) {
  return this.find({
    userId,
    status: USER_ROLE_STATUS.APPROVED,
    isActive: true,
  }).populate('roleId');
};

userRoleSchema.statics.getUserRoleCodes = async function (userId: Types.ObjectId): Promise<string[]> {
  const activeRoleCodes = await Role.find({ isActive: true }).distinct('code');
  const userRoles = await this.find({
    userId,
    roleCode: { $in: activeRoleCodes },
    status: USER_ROLE_STATUS.APPROVED,
    isActive: true,
  }).select('roleCode');
  return userRoles.map((ur: IUserRole) => ur.roleCode);
};

userRoleSchema.statics.assignRole = async function (
  userId: Types.ObjectId,
  roleCode: string,
  options: AssignRoleOptions = {},
): Promise<IUserRole> {
  const role = await Role.findByCode(roleCode);

  if (!role) {
    throw new Error(`Role not found: ${roleCode}`);
  }

  const existing = await this.findOne({ userId, roleCode });
  if (existing) {
    throw new Error(`User already has role: ${roleCode}`);
  }

  const userRole = new this({
    userId,
    roleId: role._id,
    roleCode,
    requestedAt: new Date(),
    requestedBy: options.requestedBy || userId,
  });

  if (options.autoApprove || role.autoApproveOnSignup) {
    userRole.status = USER_ROLE_STATUS.APPROVED;
    userRole.isActive = true;
    userRole.approvedAt = new Date();
    userRole.approvedBy = options.approvedBy || userId;
  }

  return userRole.save();
};

const UserRole = mongoose.model<IUserRole, IUserRoleModel>('UserRole', userRoleSchema);

export default UserRole;
