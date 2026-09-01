import type { Types } from 'mongoose';
import mongoose, { Schema } from 'mongoose';
import { ROLE_CODE } from '../Role';
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
  const userRoles = await this.find({
    userId,
    status: USER_ROLE_STATUS.APPROVED,
    isActive: true,
  }).select('roleCode');
  return userRoles.map((ur: IUserRole) => ur.roleCode);
};

userRoleSchema.statics.hasRole = async function (userId: Types.ObjectId, roleCode: string): Promise<boolean> {
  const userRole = await this.findOne({
    userId,
    roleCode,
    status: USER_ROLE_STATUS.APPROVED,
    isActive: true,
  });
  return !!userRole;
};

userRoleSchema.statics.getPendingRequests = function (roleCode: string | null = null) {
  const query: Record<string, unknown> = { status: USER_ROLE_STATUS.PENDING };
  if (roleCode) query.roleCode = roleCode;

  return this.find(query)
    .populate('userId', 'email firstName lastName')
    .populate('roleId', 'name code')
    .sort({ requestedAt: 1 });
};

userRoleSchema.methods.approve = async function (this: IUserRole, approvedByUserId: Types.ObjectId): Promise<IUserRole> {
  if (this.status !== USER_ROLE_STATUS.PENDING) {
    throw new Error(`Cannot approve role with status: ${this.status}`);
  }
  this.status = USER_ROLE_STATUS.APPROVED;
  this.isActive = true;
  this.approvedAt = new Date();
  this.approvedBy = approvedByUserId;
  return this.save();
};

userRoleSchema.methods.reject = async function (this: IUserRole, rejectedByUserId: Types.ObjectId, reason: string): Promise<IUserRole> {
  if (this.status !== USER_ROLE_STATUS.PENDING) {
    throw new Error(`Cannot reject role with status: ${this.status}`);
  }
  this.status = USER_ROLE_STATUS.REJECTED;
  this.isActive = false;
  this.rejectedAt = new Date();
  this.rejectedBy = rejectedByUserId;
  this.rejectionReason = reason;
  return this.save();
};

userRoleSchema.methods.suspend = async function (this: IUserRole, suspendedByUserId: Types.ObjectId, reason: string): Promise<IUserRole> {
  if (this.status !== USER_ROLE_STATUS.APPROVED) {
    throw new Error(`Cannot suspend role with status: ${this.status}`);
  }
  this.status = USER_ROLE_STATUS.SUSPENDED;
  this.isActive = false;
  this.suspendedAt = new Date();
  this.suspendedBy = suspendedByUserId;
  this.suspensionReason = reason;
  return this.save();
};

userRoleSchema.methods.unsuspend = async function (this: IUserRole): Promise<IUserRole> {
  if (this.status !== USER_ROLE_STATUS.SUSPENDED) {
    throw new Error(`Cannot unsuspend role with status: ${this.status}`);
  }
  this.status = USER_ROLE_STATUS.APPROVED;
  this.isActive = true;
  this.suspendedAt = null;
  this.suspendedBy = null;
  this.suspensionReason = null;
  return this.save();
};

userRoleSchema.methods.revoke = async function (this: IUserRole, revokedByUserId: Types.ObjectId, reason: string): Promise<IUserRole> {
  if (this.status === USER_ROLE_STATUS.REVOKED) {
    throw new Error('Role is already revoked');
  }
  this.status = USER_ROLE_STATUS.REVOKED;
  this.isActive = false;
  this.revokedAt = new Date();
  this.revokedBy = revokedByUserId;
  this.revocationReason = reason;
  return this.save();
};

userRoleSchema.statics.assignRole = async function (
  userId: Types.ObjectId,
  roleCode: string,
  options: AssignRoleOptions = {},
): Promise<IUserRole> {
  const Role = mongoose.model('Role');
  const role = await (Role as any).findByCode(roleCode);

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
