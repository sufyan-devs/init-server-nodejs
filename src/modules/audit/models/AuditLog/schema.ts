import mongoose, { Schema } from 'mongoose';
import type { IAuditLog } from './types';
import { AUDIT_ACTION, AUDIT_OUTCOME } from './types';

const auditLogSchema = new Schema<IAuditLog>(
  {
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    action: {
      type: String,
      required: true,
      enum: Object.values(AUDIT_ACTION),
    },
    resource: String,
    resourceId: String,
    outcome: {
      type: String,
      required: true,
      enum: Object.values(AUDIT_OUTCOME),
    },
    meta: Schema.Types.Mixed,
    ip: String,
    userAgent: String,
  },
  {
    timestamps: true,
  },
);

auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);

export default AuditLog;
