import { createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { envConfig, type EnvConfig } from '@config/env';
import ApiError from '@utils/apiError';
import AuthErrors from '@constants/authErrors';
import { logger } from '@utils/logger';
import { incrementWithTTL } from '@utils/redisKeys';

const KEY_PREFIX = 'rl';
const IP_SCOPE = 'ip';
const ACCOUNT_SCOPE = 'acct';

const ACCOUNT_FIELD = 'email';

const HTTP_TOO_MANY_REQUESTS = 429;

const ACCOUNT_HASH_CHARS = 32;

const MAX_ACCOUNT_INPUT_CHARS = 320;

type RateLimitRule = EnvConfig['RATE_LIMIT']['GLOBAL'];

type LimitBy = 'ip' | 'both';

interface RateLimitOptions {
  bucket: string;
  rule: RateLimitRule;
  by: LimitBy;
}

type RateLimitMiddleware = (req: Request, res: Response, next: NextFunction) => Promise<void>;

interface CounterReading {
  identifier: string;
  count: number;
  resetSeconds: number;
}

const rateLimitKey = (bucket: string, identifier: string): string =>
  `${KEY_PREFIX}:${bucket}:${identifier}`;

const clientIp = (req: Request): string => (req.ip ?? req.socket.remoteAddress ?? '').trim();

const defaultAccountKey = (req: Request): string | undefined => {
  const body = req.body as Record<string, unknown> | undefined;
  const value = body?.[ACCOUNT_FIELD];
  return typeof value === 'string' ? value : undefined;
};

const accountIdentifier = (raw: string): string => {
  const normalised = raw.trim().toLowerCase().slice(0, MAX_ACCOUNT_INPUT_CHARS);
  if (normalised === '') return '';
  const digest = createHash('sha256').update(normalised).digest('hex').slice(0, ACCOUNT_HASH_CHARS);
  return `${ACCOUNT_SCOPE}:${digest}`;
};

const resolveIdentifiers = (req: Request, options: RateLimitOptions): string[] => {
  const identifiers: string[] = [];
  const ip = clientIp(req);
  const ipIdentifier = ip === '' ? '' : `${IP_SCOPE}:${ip}`;

  if (ipIdentifier !== '') identifiers.push(ipIdentifier);

  if (options.by === 'ip') return identifiers;

  const raw = defaultAccountKey(req);
  const account = raw ? accountIdentifier(raw) : '';
  if (account !== '') identifiers.push(account);

  return identifiers;
};

const hitCounters = async (
  identifiers: string[],
  bucket: string,
  rule: RateLimitRule,
): Promise<CounterReading[]> => {
  const keys = identifiers.map((identifier) => rateLimitKey(bucket, identifier));
  const hits = await incrementWithTTL(keys, rule.WINDOW_SECONDS);

  return identifiers.map((identifier, index) => ({
    identifier,
    count: hits[index].count,
    resetSeconds: hits[index].ttlSeconds > 0 ? hits[index].ttlSeconds : rule.WINDOW_SECONDS,
  }));
};

const bindingCounter = (readings: CounterReading[]): CounterReading =>
  readings.reduce((highest, reading) => (reading.count > highest.count ? reading : highest));

const setQuotaHeaders = (res: Response, limit: number, remaining: number, resetSeconds: number): void => {
  res.setHeader('RateLimit-Limit', limit);
  res.setHeader('RateLimit-Remaining', remaining);
  res.setHeader('RateLimit-Reset', resetSeconds);
};

const setRetryAfter = (res: Response, resetSeconds: number): void => {
  res.setHeader('Retry-After', resetSeconds);
};

const rateLimit = (options: RateLimitOptions): RateLimitMiddleware => {
  const { bucket, rule } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!envConfig.RATE_LIMIT.ENABLED) {
      next();
      return;
    }

    let readings: CounterReading[];
    try {
      readings = await hitCounters(resolveIdentifiers(req, options), bucket, rule);
    } catch (error: unknown) {
      // Fails open on purpose: a Redis outage must not become a full product outage.
      logger.error('Rate limit check failed — allowing request through (fail open)', {
        bucket,
        error: error instanceof Error ? error.message : String(error),
      });
      next();
      return;
    }

    if (readings.length === 0) {
      next();
      return;
    }

    const binding = bindingCounter(readings);
    const remaining = Math.max(0, rule.MAX - binding.count);
    setQuotaHeaders(res, rule.MAX, remaining, binding.resetSeconds);

    if (binding.count <= rule.MAX) {
      next();
      return;
    }

    setRetryAfter(res, binding.resetSeconds);

    logger.warn('Rate limit exceeded', {
      bucket,
      identifier: binding.identifier,
      retryAfterSeconds: binding.resetSeconds,
      path: req.originalUrl,
    });

    next(ApiError.fromAuthError(HTTP_TOO_MANY_REQUESTS, AuthErrors.RATE_LIMIT_EXCEEDED));
  };
};

const globalRateLimit = rateLimit({
  bucket: 'global',
  rule: envConfig.RATE_LIMIT.GLOBAL,
  by: 'ip',
});

export { rateLimit, globalRateLimit };
export type { RateLimitOptions, RateLimitMiddleware, LimitBy };
