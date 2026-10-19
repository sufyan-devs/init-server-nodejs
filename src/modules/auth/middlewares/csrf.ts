import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Request, Response, NextFunction } from 'express';
import { envConfig } from '@config/env';
import ApiError from '@utils/apiError';
import AUTH_ERRORS from '@constants/authErrors';
import { PORTAL, portalCookieName, getRoleCookieName, getCookieOptions, readCookie } from '@utils/cookieHelper';
import type { Portal } from '@utils/cookieHelper';
import { sidFromToken } from '@auth/services/session.service';

const randomBytesAsync = promisify(randomBytes);

const RANDOM_BYTES = 32;

const TOKEN_SEPARATOR = '.';

const TOKEN_PART_COUNT = 2;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

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
  roleCode: string,
): Promise<string> => {
  const random = (await randomBytesAsync(RANDOM_BYTES)).toString('base64url');
  const token = `${random}${TOKEN_SEPARATOR}${sign(sid, random)}`;

  res.cookie(csrfCookieName(getRoleCookieName(roleCode)), token, {
    ...getCookieOptions(),
    httpOnly: false,
    signed: false,
    // The session cookie slides up to the absolute cap. If this one expired first the
    // user would keep a live session that fails every write with 403, unrecoverably:
    // a new CSRF cookie is only issued at login, and they are not logged out.
    maxAge: envConfig.SESSION.ABSOLUTE_MAX_MS,
  });

  return token;
};

const signaturesMatch = (candidate: string, expected: string): boolean => {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

const PORTAL_SEGMENTS: ReadonlySet<string> = new Set(Object.values(PORTAL));

const isPortal = (segment: string | undefined): segment is Portal =>
  segment !== undefined && PORTAL_SEGMENTS.has(segment);

// The portal comes from the URL, not the cookie jar: mounted router-wide this runs before
// `authenticate`, so `req.sessionId` is unset and jar order would decide which portal wins.
const currentSession = (req: Request): { sid: string; cookieName: string } | undefined => {
  const base = envConfig.SESSION.COOKIE.NAME;

  const segment = req.path.split('/')[1];
  if (isPortal(segment)) {
    const cookieName = portalCookieName(segment);
    const value = readCookie(req, cookieName);
    return typeof value === 'string' ? { sid: sidFromToken(value), cookieName } : undefined;
  }

  if (!req.sessionId) return undefined;
  const jar = { ...(req.cookies as Record<string, unknown>), ...(req.signedCookies as Record<string, unknown>) };
  for (const [cookieName, value] of Object.entries(jar)) {
    if (!cookieName.startsWith(base) || typeof value !== 'string') continue;
    if (sidFromToken(value) === req.sessionId) return { sid: req.sessionId, cookieName };
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
    return next(ApiError.fromAuthError(AUTH_ERRORS.CSRF_MISSING));
  }

  const [random] = cookie.split(TOKEN_SEPARATOR);
  const parts = header.split(TOKEN_SEPARATOR);

  if (!random || parts.length !== TOKEN_PART_COUNT) {
    return next(ApiError.fromAuthError(AUTH_ERRORS.CSRF_INVALID));
  }
  if (!signaturesMatch(parts[1], sign(session.sid, random))) {
    return next(ApiError.fromAuthError(AUTH_ERRORS.CSRF_INVALID));
  }

  next();
};

export { issueCsrfToken, verifyCsrf };
