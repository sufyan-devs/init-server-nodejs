import type { Request, Response, CookieOptions } from 'express';
import { envConfig } from '@config/env';

const BASE_COOKIE_NAME: string = envConfig.SESSION.COOKIE.NAME;

const PORTAL = {
  ADMIN: 'admin',
  VENDOR: 'vendor',
  ASSOCIATE: 'associate',
  CUSTOMER: 'customer',
} as const;

export type Portal = (typeof PORTAL)[keyof typeof PORTAL];

const ROLE_PORTAL: Record<string, Portal> = {
  SUPER_ADMIN: PORTAL.ADMIN,
  ADMIN: PORTAL.ADMIN,
  VENDOR: PORTAL.VENDOR,
  BUSINESS_ASSOCIATE: PORTAL.ASSOCIATE,
  CUSTOMER: PORTAL.CUSTOMER,
};

const RESET_COOKIE_NAME = `${BASE_COOKIE_NAME}_reset`;

const portalOf = (roleCode: string): Portal | undefined => ROLE_PORTAL[roleCode];

const portalCookieName = (portal: Portal): string => `${BASE_COOKIE_NAME}_${portal}`;

const getRoleCookieName = (roleCode: string): string => {
  const portal = portalOf(roleCode);
  return portal ? portalCookieName(portal) : BASE_COOKIE_NAME;
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

const setSessionCookie = (res: Response, token: string, roleCode: string): void => {
  res.cookie(getRoleCookieName(roleCode), token, getCookieOptions());
};

const clearSessionCookie = (res: Response, roleCode: string): void => {
  res.cookie(getRoleCookieName(roleCode), '', { ...getCookieOptions(), maxAge: 0 });
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
  token: string,
  roleCode: string,
  maxAgeMs: number,
): void => {
  if (maxAgeMs <= 0) return;
  res.cookie(getRoleCookieName(roleCode), token, { ...getCookieOptions(), maxAge: maxAgeMs });
};

// signedCookies only: cookie-parser leaves an unsigned or tampered value in req.cookies,
// and these cookies are always written signed.
const readCookie = (req: Request, name: string): string | undefined => {
  const value: unknown = req.signedCookies?.[name];
  return typeof value === 'string' ? value : undefined;
};

const getSessionToken = (req: Request, roleCode: string): string | undefined =>
  readCookie(req, getRoleCookieName(roleCode)) || undefined;

const getResetToken = (req: Request): string | null =>
  readCookie(req, RESET_COOKIE_NAME) ?? null;

export {
  PORTAL,
  portalOf,
  portalCookieName,
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
