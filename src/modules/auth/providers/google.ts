// Google ID-token validation rules (iss, aud, exp) and jwks_uri, checked 2026-08-24:
// https://developers.google.com/identity/openid-connect/openid-connect#validatinganidtoken

import { createPublicKey } from 'node:crypto';
import type { JsonWebKey } from 'node:crypto';
import axios from 'axios';
import type { AxiosResponse } from 'axios';
import jwt from 'jsonwebtoken';
import type { Algorithm, JwtPayload } from 'jsonwebtoken';
import { envConfig } from '@config/env';
import ApiError from '@utils/apiError';
import type { AuthError } from '@constants/authErrors';
import { logger } from '@utils/logger';
import { AUTH_PROVIDER } from './types';
import type { IdentityProvider, NormalizedIdentity } from './types';
import { errorMessage } from '@utils/format';

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const GOOGLE_ALGORITHM: Algorithm = 'RS256';
const GOOGLE_ALGORITHMS: Algorithm[] = [GOOGLE_ALGORITHM];

const TOKEN_FIELDS = ['idToken', 'credential', 'id_token'];

const MS_PER_SECOND = 1000;
const CERTS_TIMEOUT_MS = 5 * MS_PER_SECOND;
const DEFAULT_CERTS_TTL_MS = 60 * 60 * MS_PER_SECOND;
const MIN_CERTS_TTL_MS = 60 * MS_PER_SECOND;
const MIN_REFETCH_INTERVAL_MS = 60 * MS_PER_SECOND;
const MAX_AGE_PATTERN = /max-age\s*=\s*(\d+)/i;

const GOOGLE_ERRORS = {
  INVALID_TOKEN: {
    code: 'AUTH_GOOGLE_INVALID_TOKEN',
    message: 'Google sign-in could not be verified. Please try again.',
  },
  EMAIL_NOT_VERIFIED: {
    code: 'AUTH_GOOGLE_EMAIL_NOT_VERIFIED',
    message: 'Your Google account email is not verified. Verify it with Google and try again.',
  },
  NOT_CONFIGURED: {
    code: 'AUTH_GOOGLE_NOT_CONFIGURED',
    message: 'Google sign-in is not available.',
  },
  UNAVAILABLE: {
    code: 'AUTH_GOOGLE_UNAVAILABLE',
    message: 'Google sign-in is temporarily unavailable. Please try again shortly.',
  },
} as const satisfies Record<string, AuthError>;

type GoogleJwk = JsonWebKey & { kid?: string };

interface GoogleCertsResponse {
  keys?: GoogleJwk[];
}

interface GoogleIdTokenPayload extends JwtPayload {
  email?: string;
  email_verified?: boolean | string;
  given_name?: string;
  family_name?: string;
  name?: string;
  picture?: string;
}

interface CertCache {
  keys: Map<string, string>;
  expiresAt: number;
  fetchedAt: number;
}

let certCache: CertCache | null = null;
let pendingFetch: Promise<CertCache> | null = null;

const readString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const readToken = (credential: Record<string, unknown>): string | undefined => {
  for (const field of TOKEN_FIELDS) {
    const token = readString(credential[field]);
    if (token) return token;
  }
  return undefined;
};

const parseMaxAgeMs = (cacheControl: unknown): number => {
  if (typeof cacheControl !== 'string') return DEFAULT_CERTS_TTL_MS;

  const match = MAX_AGE_PATTERN.exec(cacheControl);
  if (!match) return DEFAULT_CERTS_TTL_MS;

  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_CERTS_TTL_MS;

  return Math.max(seconds * MS_PER_SECOND, MIN_CERTS_TTL_MS);
};

const toPublicKeyPem = (jwk: GoogleJwk): string =>
  createPublicKey({ key: jwk, format: 'jwk' })
    .export({ type: 'spki', format: 'pem' })
    .toString();

const fetchCerts = async (): Promise<CertCache> => {
  let response: AxiosResponse<GoogleCertsResponse>;
  try {
    response = await axios.get<GoogleCertsResponse>(GOOGLE_CERTS_URL, {
      timeout: CERTS_TIMEOUT_MS,
    });
  } catch (error) {
    logger.error('Failed to fetch Google signing keys', {
      reason: errorMessage(error),
    });
    throw ApiError.fromAuthError(503, GOOGLE_ERRORS.UNAVAILABLE);
  }

  const keys = new Map<string, string>();
  for (const jwk of response.data.keys ?? []) {
    if (!jwk.kid) continue;
    keys.set(jwk.kid, toPublicKeyPem(jwk));
  }

  if (keys.size === 0) {
    logger.error('Google returned no usable signing keys');
    throw ApiError.fromAuthError(503, GOOGLE_ERRORS.UNAVAILABLE);
  }

  const now = Date.now();
  const ttlMs = parseMaxAgeMs(response.headers['cache-control']);
  logger.debug('Cached Google signing keys', { count: keys.size, ttlMs });

  return { keys, expiresAt: now + ttlMs, fetchedAt: now };
};

const loadCerts = async (force: boolean): Promise<CertCache> => {
  const now = Date.now();
  if (certCache && !force && certCache.expiresAt > now) return certCache;
  if (certCache && force && now - certCache.fetchedAt < MIN_REFETCH_INTERVAL_MS) return certCache;

  let fetchInFlight = pendingFetch;
  if (!fetchInFlight) {
    fetchInFlight = fetchCerts().finally(() => {
      pendingFetch = null;
    });
    pendingFetch = fetchInFlight;
  }

  try {
    const fetched = await fetchInFlight;
    certCache = fetched;
    return fetched;
  } catch (error) {
    if (!certCache) throw error;
    logger.warn('Serving cached Google signing keys after a failed refresh');
    return certCache;
  }
};

const getSigningKey = async (kid: string): Promise<string> => {
  const cached = await loadCerts(false);
  const key = cached.keys.get(kid);
  if (key) return key;

  const refreshed = await loadCerts(true);
  const rotatedKey = refreshed.keys.get(kid);
  if (rotatedKey) return rotatedKey;

  logger.warn('Google ID token signed with an unknown key', { kid });
  throw ApiError.fromAuthError(401, GOOGLE_ERRORS.INVALID_TOKEN);
};

const isEmailVerified = (claim: boolean | string | undefined): boolean =>
  claim === true || claim === 'true';

const splitName = (payload: GoogleIdTokenPayload): { firstName?: string; lastName?: string } => {
  const given = readString(payload.given_name);
  const family = readString(payload.family_name);
  if (given || family) return { firstName: given, lastName: family };

  const fullName = readString(payload.name);
  if (!fullName) return {};

  const [first, ...rest] = fullName.split(/\s+/);
  return { firstName: first, lastName: rest.length > 0 ? rest.join(' ') : undefined };
};

const isEnabled = (): boolean =>
  envConfig.AUTH.GOOGLE.ENABLED && envConfig.AUTH.GOOGLE.CLIENT_IDS.length > 0;

const verify = async (credential: Record<string, unknown>): Promise<NormalizedIdentity> => {
  const clientIds = envConfig.AUTH.GOOGLE.CLIENT_IDS;
  if (clientIds.length === 0) throw ApiError.fromAuthError(503, GOOGLE_ERRORS.NOT_CONFIGURED);

  const token = readToken(credential);
  if (!token) throw ApiError.fromAuthError(401, GOOGLE_ERRORS.INVALID_TOKEN);

  const header = jwt.decode(token, { complete: true })?.header;
  const kid = readString(header?.kid);
  if (!kid || header?.alg !== GOOGLE_ALGORITHM) {
    throw ApiError.fromAuthError(401, GOOGLE_ERRORS.INVALID_TOKEN);
  }

  const publicKey = await getSigningKey(kid);

  let payload: GoogleIdTokenPayload;
  try {
    payload = jwt.verify(token, publicKey, {
      algorithms: GOOGLE_ALGORITHMS,
      issuer: [...GOOGLE_ISSUERS] as [string, ...string[]],
      audience: [...clientIds] as [string, ...string[]],
    }) as GoogleIdTokenPayload;
  } catch (error) {
    logger.warn('Google ID token rejected', { kid, reason: errorMessage(error) });
    throw ApiError.fromAuthError(401, GOOGLE_ERRORS.INVALID_TOKEN);
  }

  const providerUserId = readString(payload.sub);
  if (!providerUserId) throw ApiError.fromAuthError(401, GOOGLE_ERRORS.INVALID_TOKEN);

  if (!isEmailVerified(payload.email_verified)) {
    throw ApiError.fromAuthError(401, GOOGLE_ERRORS.EMAIL_NOT_VERIFIED);
  }

  const email = readString(payload.email)?.toLowerCase();
  if (!email) throw ApiError.fromAuthError(401, GOOGLE_ERRORS.INVALID_TOKEN);

  const { firstName, lastName } = splitName(payload);

  return {
    provider: AUTH_PROVIDER.GOOGLE,
    providerUserId,
    email,
    emailVerified: true,
    firstName,
    lastName,
    avatarUrl: readString(payload.picture),
  };
};

const googleProvider: IdentityProvider = {
  id: AUTH_PROVIDER.GOOGLE,
  isEnabled,
  verify,
};

export default googleProvider;
