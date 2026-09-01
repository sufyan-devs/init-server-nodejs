import type { Document, Types } from 'mongoose';

export const AUDIT_ACTION = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  LOGOUT: 'LOGOUT',
  LOGOUT_ALL: 'LOGOUT_ALL',
  SESSION_REVOKED: 'SESSION_REVOKED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  REGISTER: 'REGISTER',
  PROVIDER_LINKED: 'PROVIDER_LINKED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
} as const;

export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];

export const AUDIT_OUTCOME = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  DENIED: 'denied',
} as const;

export type AuditOutcome = (typeof AUDIT_OUTCOME)[keyof typeof AUDIT_OUTCOME];

export interface IAuditLog extends Document {
  _id: Types.ObjectId;
  actorId: Types.ObjectId | null;
  action: AuditAction;
  resource?: string;
  resourceId?: string;
  outcome: AuditOutcome;
  meta?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditEntry {
  actorId?: Types.ObjectId | string | null;
  action: AuditAction;
  resource?: string;
  resourceId?: string;
  outcome: AuditOutcome;
  meta?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}
