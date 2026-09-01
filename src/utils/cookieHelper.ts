import type { Request, Response, CookieOptions } from 'express';
import { envConfig } from '@config/env';

const BASE_COOKIE_NAME: string = envConfig.SESSION.COOKIE.NAME;

const ROLE_COOKIE_MAP: Record<string, string> = {
  SUPER_ADMIN: `${BASE_COOKIE_NAME}_admin`,
  ADMIN: `${BASE_COOKIE_NAME}_admin`,
  VENDOR: `${BASE_COOKIE_NAME}_vendor`,
  BUSINESS_ASSOCIATE: `${BASE_COOKIE_NAME}_associate`,
  CUSTOMER: `${BASE_COOKIE_NAME}_customer`,
  RESET: `${BASE_COOKIE_NAME}_reset`,
};

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

const setSessionCookie = (res: Response, token: string, roleOrOptions?: string | CookieOptions): void => {
  const role = typeof roleOrOptions === 'string' ? roleOrOptions : undefined;
  const overrides = typeof roleOrOptions === 'object' ? roleOrOptions : {};
  const cookieName = getRoleCookieName(role);
  res.cookie(cookieName, token, { ...getCookieOptions(), ...overrides });
};

const clearSessionCookie = (res: Response, role?: string): void => {
  const cookieName = getRoleCookieName(role);
  res.cookie(cookieName, '', { ...getCookieOptions(), maxAge: 0 });
};

interface SessionTokenResult {
  token: string;
  cookieName: string;
}

const getSessionToken = (req: Request, role?: string): SessionTokenResult | null => {
  if (role) {
    const name = getRoleCookieName(role);
    if (req.signedCookies?.[name]) return { token: req.signedCookies[name] as string, cookieName: name };
    if (req.cookies?.[name]) return { token: req.cookies[name] as string, cookieName: name };
    return null;
  }

  for (const name of ALL_SESSION_COOKIES) {
    if (req.signedCookies?.[name]) return { token: req.signedCookies[name] as string, cookieName: name };
    if (req.cookies?.[name]) return { token: req.cookies[name] as string, cookieName: name };
  }
  if (req.signedCookies?.[BASE_COOKIE_NAME]) return { token: req.signedCookies[BASE_COOKIE_NAME] as string, cookieName: BASE_COOKIE_NAME };
  if (req.cookies?.[BASE_COOKIE_NAME]) return { token: req.cookies[BASE_COOKIE_NAME] as string, cookieName: BASE_COOKIE_NAME };
  return null;
};

const getResetToken = (req: Request): string | null => {
  const name = ROLE_COOKIE_MAP.RESET;
  if (req.signedCookies?.[name]) return req.signedCookies[name] as string;
  if (req.cookies?.[name]) return req.cookies[name] as string;
  return null;
};

const COOKIE_NAME = BASE_COOKIE_NAME;

export { COOKIE_NAME, getRoleCookieName, getCookieOptions, setSessionCookie, clearSessionCookie, getSessionToken, getResetToken };
