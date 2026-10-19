import type { Request, Response, CookieOptions } from 'express';
import { envConfig } from '@config/env';

const BASE_COOKIE_NAME: string = envConfig.SESSION.COOKIE.NAME;

const ROLE_COOKIE_MAP: Record<string, string> = {
  SUPER_ADMIN: `${BASE_COOKIE_NAME}_admin`,
  ADMIN: `${BASE_COOKIE_NAME}_admin`,
  VENDOR: `${BASE_COOKIE_NAME}_vendor`,
  BUSINESS_ASSOCIATE: `${BASE_COOKIE_NAME}_associate`,
  CUSTOMER: `${BASE_COOKIE_NAME}_customer`,
};

const RESET_COOKIE_NAME = `${BASE_COOKIE_NAME}_reset`;

const ALL_SESSION_COOKIES = [
  ROLE_COOKIE_MAP.ADMIN,
  ROLE_COOKIE_MAP.VENDOR,
  ROLE_COOKIE_MAP.BUSINESS_ASSOCIATE,
  ROLE_COOKIE_MAP.CUSTOMER,
];

const getRoleCookieName = (role?: string): string => {
  if (role && ROLE_COOKIE_MAP[role]) return ROLE_COOKIE_MAP[role];
  return BASE_COOKIE_NAME;
};

const getCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: envConfig.SESSION.COOKIE.SECURE,
  sameSite: envConfig.SESSION.COOKIE.SAME_SITE,
  maxAge: envConfig.SESSION.COOKIE.MAX_AGE_MS,
  path: '/',
  signed: true,
  ...(envConfig.SESSION.COOKIE.DOMAIN ? { domain: envConfig.SESSION.COOKIE.DOMAIN } : {}),
});

const setSessionCookie = (res: Response, token: string, role?: string): void => {
  res.cookie(getRoleCookieName(role), token, getCookieOptions());
};

const clearSessionCookie = (res: Response, role?: string): void => {
  res.cookie(getRoleCookieName(role), '', { ...getCookieOptions(), maxAge: 0 });
};

const setResetCookie = (res: Response, token: string): void => {
  res.cookie(RESET_COOKIE_NAME, token, getCookieOptions());
};

const clearResetCookie = (res: Response): void => {
  res.cookie(RESET_COOKIE_NAME, '', { ...getCookieOptions(), maxAge: 0 });
};

// A cookie's Max-Age is fixed when written while the Redis TTL slides on use, so a
// cookie stamped only at login expires under a user whose session is still alive.
const refreshSessionCookie = (
  res: Response,
  cookieName: string,
  token: string,
  maxAgeMs: number,
): void => {
  if (maxAgeMs <= 0) return;
  res.cookie(cookieName, token, { ...getCookieOptions(), maxAge: maxAgeMs });
};

interface SessionTokenResult {
  token: string;
  cookieName: string;
}

// Signed first: cookie-parser puts a verified cookie in signedCookies and leaves the
// unverified original in cookies, so reading cookies first would accept a forged value.
const readCookie = (req: Request, name: string): string | undefined =>
  (req.signedCookies?.[name] ?? req.cookies?.[name]) as string | undefined;

const getSessionToken = (req: Request, role?: string): SessionTokenResult | null => {
  const names = role ? [getRoleCookieName(role)] : [...ALL_SESSION_COOKIES, BASE_COOKIE_NAME];

  for (const cookieName of names) {
    const token = readCookie(req, cookieName);
    if (token) return { token, cookieName };
  }
  return null;
};

const getResetToken = (req: Request): string | null =>
  readCookie(req, RESET_COOKIE_NAME) ?? null;

export {
  getRoleCookieName,
  getCookieOptions,
  setSessionCookie,
  refreshSessionCookie,
  clearSessionCookie,
  setResetCookie,
  clearResetCookie,
  readCookie,
  getSessionToken,
  getResetToken,
};
