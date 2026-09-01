import { Types } from 'mongoose';
import User, { USER_STATUS } from '@user/models/User';
import type { IUser } from '@user/models/User';
import Role from '@user/models/Role';
import UserRole from '@user/models/UserRole';
import ApiError from '@utils/apiError';
import AuthErrors from '@constants/authErrors';
import { logger } from '@utils/logger';
import { AUTH_PROVIDER } from '@auth/providers';
import type { NormalizedIdentity, UserIdentity } from '@auth/providers';

const DUPLICATE_KEY_ERROR_CODE = 11000;

const NAME_FALLBACK = 'User';

interface ResolvedUser {
  user: IUser;
  userId: string;
  isNewUser: boolean;
}

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: number }).code === DUPLICATE_KEY_ERROR_CODE;

const normalizeEmail = (email: string | undefined): string | undefined => {
  const trimmed = email?.trim().toLowerCase();
  return trimmed === '' ? undefined : trimmed;
};

const pickName = (value: string | undefined, fallback: string): string => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
};

const toIdentityEntry = (identity: NormalizedIdentity): UserIdentity => ({
  provider: identity.provider,
  providerUserId: identity.providerUserId,
  email: normalizeEmail(identity.email),
  linkedAt: new Date(),
});

const assertUsable = (user: IUser): void => {
  if (user.status === USER_STATUS.ACTIVE) return;
  throw ApiError.fromAuthError(403, AuthErrors.ACCOUNT_INACTIVE);
};

const findByIdentity = async (identity: NormalizedIdentity): Promise<IUser | null> => {
  const user = await User.findOne({
    identities: {
      $elemMatch: {
        provider: identity.provider,
        providerUserId: identity.providerUserId,
      },
    },
  });
  return user;
};

// Never link on an unverified email: claiming an address would otherwise take over the account.
const findLinkTarget = async (identity: NormalizedIdentity): Promise<IUser | null> => {
  if (identity.provider === AUTH_PROVIDER.PASSWORD) {
    if (!Types.ObjectId.isValid(identity.providerUserId)) return null;
    const user = await User.findById(identity.providerUserId);
    return user;
  }

  const email = normalizeEmail(identity.email);
  if (!email || !identity.emailVerified) return null;

  return User.findByEmail(email);
};

const linkIdentity = async (user: IUser, identity: NormalizedIdentity): Promise<void> => {
  try {
    await User.updateOne({ _id: user._id }, { $push: { identities: toIdentityEntry(identity) } });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    logger.warn('Refused to link an identity that belongs to another account', {
      provider: identity.provider,
    });
    throw ApiError.fromAuthError(409, AuthErrors.EMAIL_ALREADY_EXISTS);
  }

  logger.info('Linked provider identity to existing user', {
    provider: identity.provider,
    userId: user._id.toString(),
  });
};

const createUserDocument = async (
  identity: NormalizedIdentity,
  email: string,
  emailVerified: boolean,
): Promise<IUser | null> => {
  const [emailLocalPart] = email.split('@');

  try {
    return await User.create({
      email,
      emailVerified,
      firstName: pickName(identity.firstName, pickName(emailLocalPart, NAME_FALLBACK)),
      lastName: pickName(identity.lastName, NAME_FALLBACK),
      profileImage: identity.avatarUrl ?? null,
      identities: [toIdentityEntry(identity)],
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) return null;
    throw error;
  }
};

const createUser = async (
  identity: NormalizedIdentity,
  email: string,
  roleCode: string,
): Promise<ResolvedUser> => {
  const role = await Role.findByCode(roleCode);
  if (!role) throw ApiError.fromAuthError(400, AuthErrors.INVALID_ROLE_REQUEST);
  if (!role.canSelfRegister) throw ApiError.fromAuthError(403, AuthErrors.ROLE_NOT_AVAILABLE);

  const needsEmailVerification = !!role.emailVerificationRequired;

  const user = await createUserDocument(
    identity,
    email,
    identity.emailVerified || !needsEmailVerification,
  );

  if (!user) {
    const raced = await findByIdentity(identity);
    if (raced) {
      assertUsable(raced);
      return { user: raced, userId: raced._id.toString(), isNewUser: false };
    }
    throw ApiError.fromAuthError(409, AuthErrors.EMAIL_ALREADY_EXISTS);
  }

  await UserRole.assignRole(user._id, roleCode, {
    requestedBy: user._id,
    autoApprove: role.autoApproveOnSignup,
    approvedBy: role.autoApproveOnSignup ? user._id : undefined,
  });

  logger.info('Created user from a provider identity', {
    provider: identity.provider,
    roleCode,
    userId: user._id.toString(),
  });

  return { user, userId: user._id.toString(), isNewUser: true };
};

const resolveUser = async (
  identity: NormalizedIdentity,
  roleCode: string,
): Promise<ResolvedUser> => {
  const known = await findByIdentity(identity);
  if (known) {
    assertUsable(known);
    return { user: known, userId: known._id.toString(), isNewUser: false };
  }

  const linkTarget = await findLinkTarget(identity);
  if (linkTarget) {
    assertUsable(linkTarget);
    await linkIdentity(linkTarget, identity);
    return { user: linkTarget, userId: linkTarget._id.toString(), isNewUser: false };
  }

  const email = normalizeEmail(identity.email);
  if (!email) throw ApiError.fromAuthError(401, AuthErrors.INVALID_CREDENTIALS);

  const emailOwner = await User.findByEmail(email);
  if (emailOwner) {
    logger.warn('Refused an identity whose email already belongs to an account', {
      provider: identity.provider,
    });
    throw ApiError.fromAuthError(409, AuthErrors.EMAIL_ALREADY_EXISTS);
  }

  return createUser(identity, email, roleCode);
};

export { resolveUser };
