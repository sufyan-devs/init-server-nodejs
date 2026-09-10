import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Request, Response, NextFunction } from 'express';
import { envConfig } from '@config/env';
import ApiError from '@utils/apiError';
import AuthErrors from '@constants/authErrors';
import { getRoleCookieName } from '@utils/cookieHelper';

const randomBytesAsync = promisify(randomBytes);

const RANDOM_BYTES = 32;

const TOKEN_SEPARATOR = '.';

const TOKEN_PART_COUNT = 2;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const HTTP_FORBIDDEN = 403;

// Binding the token to the sid defends against cookie *injection*, not reading: a sibling
// subdomain or a MITM can plant a matching cookie/header pair, but only for its own sid.
const sign = (sid: string, random: string): string =>
  createHmac('sha256', envConfig.SESSION.COOKIE.SECRET)
    .update(`${sid}${TOKEN_SEPARATOR}${random}`)
    .digest('base64url');

const csrfCookieName = (sessionCookieName: string): string =>
  `${envConfig.CSRF.COOKIE_NAME}${sessionCookieName.slice(envConfig.SESSION.COOKIE.NAME.length)}`;

const issueCsrfToken = async (
  res: Response,
  sid: string,
  portalRole?: string,
): Promise<string> => {
  const random = (await randomBytesAsync(RANDOM_BYTES)).toString('base64url');
  const token = `${random}${TOKEN_SEPARATOR}${sign(sid, random)}`;

  res.cookie(csrfCookieName(getRoleCookieName(portalRole)), token, {
    httpOnly: false,
    signed: false,
    secure: envConfig.SESSION.COOKIE.SECURE,
    sameSite: envConfig.SESSION.COOKIE.SAME_SITE,
    // The session cookie slides up to the absolute cap. If this one expired first the
    // user would keep a live session that fails every write with 403, unrecoverably:
    // a new CSRF cookie is only issued at login, and they are not logged out.
    maxAge: envConfig.SESSION.ABSOLUTE_MAX_MS,
    path: '/',
    ...(envConfig.SESSION.COOKIE.DOMAIN ? { domain: envConfig.SESSION.COOKIE.DOMAIN } : {}),
  });

  return token;
};

const signaturesMatch = (candidate: string, expected: string): boolean => {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

const PORTAL_SEGMENTS = new Set(['admin', 'vendor', 'associate', 'customer']);

// The portal comes from the URL, not the cookie jar: mounted router-wide this runs before
// `authenticate`, so `req.sessionId` is unset and jar order would decide which portal wins.
const currentSession = (req: Request): { sid: string; cookieName: string } | undefined => {
  const base = envConfig.SESSION.COOKIE.NAME;
  const jar = { ...(req.cookies as Record<string, unknown>), ...(req.signedCookies as Record<string, unknown>) };
  const read = (name: string): string | undefined =>
    typeof jar[name] === 'string' ? (jar[name] as string) : undefined;

  const segment = req.path.split('/')[1];
  if (segment && PORTAL_SEGMENTS.has(segment)) {
    const cookieName = `${base}_${segment}`;
    const value = read(cookieName);
    return value ? { sid: value.split(TOKEN_SEPARATOR)[0], cookieName } : undefined;
  }

  if (!req.sessionId) return undefined;
  for (const [cookieName, value] of Object.entries(jar)) {
    if (!cookieName.startsWith(base) || typeof value !== 'string') continue;
    if (value.split(TOKEN_SEPARATOR)[0] === req.sessionId) return { sid: req.sessionId, cookieName };
  }
  return undefined;
};

const verifyCsrf = (req: Request, _res: Response, next: NextFunction): void => {
  if (!envConfig.CSRF.ENABLED) return next();
  if (SAFE_METHODS.has(req.method)) return next();

  const session = currentSession(req);
  const header = req.get(envConfig.CSRF.HEADER_NAME);
  const cookie = session
    ? (req.cookies?.[csrfCookieName(session.cookieName)] as string | undefined)
    : undefined;

  if (!cookie || !header || !session) {
    return next(ApiError.fromAuthError(HTTP_FORBIDDEN, AuthErrors.CSRF_MISSING));
  }

  const [random] = cookie.split(TOKEN_SEPARATOR);
  const parts = header.split(TOKEN_SEPARATOR);

  if (!random || parts.length !== TOKEN_PART_COUNT) {
    return next(ApiError.fromAuthError(HTTP_FORBIDDEN, AuthErrors.CSRF_INVALID));
  }
  if (!signaturesMatch(parts[1], sign(session.sid, random))) {
    return next(ApiError.fromAuthError(HTTP_FORBIDDEN, AuthErrors.CSRF_INVALID));
  }

  next();
};

export { issueCsrfToken, verifyCsrf };
