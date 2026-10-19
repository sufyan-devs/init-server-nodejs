export const AUTH_PROVIDER = {
  GOOGLE: 'google',
} as const;

// Deliberately a plain string, not a union: a new provider must not require a type edit.
export type AuthProviderId = string;

export interface NormalizedIdentity {
  provider: AuthProviderId;
  providerUserId: string;
  email?: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
}

export interface IdentityProvider {
  id: AuthProviderId;
  isEnabled(): boolean;
  verify(credential: Record<string, unknown>): Promise<NormalizedIdentity>;
}

export type { UserIdentity } from '@user/models/User';

