import { verifyPassword } from '@auth/services/password.service';
import ApiError from '@utils/apiError';
import AuthErrors from '@constants/authErrors';
import { AUTH_PROVIDER } from './types';
import type { IdentityProvider, NormalizedIdentity } from './types';

const readString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const readSecret = (value: unknown): string => (typeof value === 'string' ? value : '');

const verify = async (credential: Record<string, unknown>): Promise<NormalizedIdentity> => {
  const email = readString(credential.email);
  const password = readSecret(credential.password);
  if (!email || password === '') {
    throw ApiError.fromAuthError(401, AuthErrors.INVALID_CREDENTIALS);
  }

  const user = await verifyPassword(email, password);

  return {
    provider: AUTH_PROVIDER.PASSWORD,
    providerUserId: user._id.toString(),
    email: user.email,
    emailVerified: user.emailVerified,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.profileImage ?? undefined,
  };
};

const passwordProvider: IdentityProvider = {
  id: AUTH_PROVIDER.PASSWORD,
  isEnabled: () => true,
  verify,
};

export default passwordProvider;
