export const SESSION_REVOKE_REASON = {
  MANUAL: 'manual',
  LOGOUT_ALL: 'logout_all',
  ACCOUNT_INACTIVE: 'account_inactive',
  ROLE_REVOKED: 'role_revoked',
  ADMIN: 'admin',
} as const;

export type SessionRevokeReason =
  (typeof SESSION_REVOKE_REASON)[keyof typeof SESSION_REVOKE_REASON];

export const SESSION_INVALID_REASON = {
  MALFORMED: 'malformed',
  NOT_FOUND: 'not_found',
  SECRET_MISMATCH: 'secret_mismatch',
  EXPIRED_ABSOLUTE: 'expired_absolute',
} as const;

export type SessionInvalidReason =
  (typeof SESSION_INVALID_REASON)[keyof typeof SESSION_INVALID_REASON];

// Copied into the session at login so the auth hot path needs no database read.
// Display-only: authorization uses availableRoles, and a suspended user has every
// session revoked, so nothing here can grant access it should not.
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

export interface SessionRepo {
  save(session: SessionRecord, ttlSeconds: number): Promise<void>;
  saveFields(session: SessionRecord): Promise<void>;
  findBySid(sid: string): Promise<SessionRecord | null>;
  findManyBySids(sids: string[]): Promise<Array<SessionRecord | null>>;
  deleteBySid(sid: string, userId: string): Promise<void>;
  listSidsByUser(userId: string): Promise<string[]>;
  deleteAllForUser(userId: string): Promise<void>;
  refreshTtlIfStale(sid: string, ttlSeconds: number): Promise<void>;
  pruneToLimit(userId: string, max: number): Promise<string[]>;
}

export interface SessionService {
  createSession(input: CreateSessionInput): Promise<CreatedSession>;
  verifySessionToken(token: string): Promise<VerifySessionResult>;
  revokeSession(sid: string, userId: string, reason?: SessionRevokeReason): Promise<void>;
  revokeOwnSession(sid: string, userId: string): Promise<void>;
  revokeAllSessions(userId: string, reason?: SessionRevokeReason): Promise<void>;
  listUserSessions(userId: string, currentSid?: string): Promise<SessionDevice[]>;
  switchActiveRole(sid: string, newRole: string, availableRoles: string[]): Promise<SessionRecord>;
  syncUser(userId: string, user: SessionUser): Promise<void>;
}
