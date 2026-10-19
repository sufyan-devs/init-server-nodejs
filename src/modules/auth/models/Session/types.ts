export const SESSION_REVOKE_REASON = {
  MANUAL: 'manual',
  LOGOUT_ALL: 'logout_all',
  ACCOUNT_INACTIVE: 'account_inactive',
} as const;

export type SessionRevokeReason =
  (typeof SESSION_REVOKE_REASON)[keyof typeof SESSION_REVOKE_REASON];

export const SESSION_INVALID_REASON = {
  MALFORMED: 'malformed',
  NOT_FOUND: 'not_found',
  SECRET_MISMATCH: 'secret_mismatch',
  EXPIRED_ABSOLUTE: 'expired_absolute',
  PORTAL_MISMATCH: 'portal_mismatch',
} as const;

export type SessionInvalidReason =
  (typeof SESSION_INVALID_REASON)[keyof typeof SESSION_INVALID_REASON];

// Copied into the session at login so the auth hot path needs no database read.
// Display-only: authorization reads the session's availableRoles, not these fields.
export interface SessionUser {
  email: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  profileImage: string | null;
}

export interface SessionRecord {
  sid: string;
  secretHash: string;
  userId: string;
  user: SessionUser;
  activeRole: string;
  availableRoles: string[];
  portal: string;
  ipAddress?: string;
  userAgent?: string;
  deviceInfo?: string;
  createdAt: number;
  lastSeenAt: number;
}

export interface SessionDevice {
  sid: string;
  activeRole: string;
  portal: string;
  ipAddress?: string;
  userAgent?: string;
  deviceInfo?: string;
  createdAt: number;
  lastSeenAt: number;
  current: boolean;
}

export interface CreateSessionInput {
  userId: string;
  user: SessionUser;
  activeRole: string;
  availableRoles: string[];
  portal: string;
  ipAddress?: string;
  userAgent?: string;
  deviceInfo?: string;
}

export interface CreatedSession {
  sid: string;
  token: string;
}

export type VerifySessionResult =
  | { valid: true; session: SessionRecord }
  | { valid: false; reason: SessionInvalidReason };

