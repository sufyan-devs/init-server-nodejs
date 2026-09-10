import type { Request, Response, NextFunction } from 'express';
import { envConfig, type EnvConfig } from '@config/env';
import ApiError from '@utils/apiError';
import AuthErrors from '@constants/authErrors';
import { logger } from '@utils/logger';
import { incrementWithTTL, rateLimitKey } from '@utils/redisKeys';
import type { RateLimitScope } from '@utils/redisKeys';

const IP_SCOPE: RateLimitScope = 'ip';
const ACCOUNT_SCOPE: RateLimitScope = 'acct';

const ACCOUNT_FIELD = 'email';

const HTTP_TOO_MANY_REQUESTS = 429;

type RateLimitRule = EnvConfig['RATE_LIMIT']['GLOBAL'];

type LimitBy = 'ip' | 'both';

interface RateLimitOptions {
  bucket: string;
  rule: RateLimitRule;
  by: LimitBy;
}

type RateLimitMiddleware = (req: Request, res: Response, next: NextFunction) => Promise<void>;

interface ScopedIdentifier {
  scope: RateLimitScope;
  value: string;
}

interface CounterReading {
  // Carried so a 429 log names something an operator can act on. The key holds only
  // the hash, which is not reversible.
  scope: RateLimitScope;
  value: string;
  count: number;
  resetSeconds: number;
}

const clientIp = (req: Request): string => (req.ip ?? req.socket.remoteAddress ?? '').trim();

const defaultAccountKey = (req: Request): string | undefined => {
  const body = req.body as Record<string, unknown> | undefined;
  const value = body?.[ACCOUNT_FIELD];
  return typeof value === 'string' ? value : undefined;
};

const resolveIdentifiers = (req: Request, options: RateLimitOptions): ScopedIdentifier[] => {
  const identifiers: ScopedIdentifier[] = [];
  const ip = clientIp(req);

  if (ip !== '') identifiers.push({ scope: IP_SCOPE, value: ip });

  if (options.by === 'ip') return identifiers;

  const account = defaultAccountKey(req)?.trim() ?? '';
  if (account !== '') identifiers.push({ scope: ACCOUNT_SCOPE, value: account });

  return identifiers;
};

const hitCounters = async (
  identifiers: ScopedIdentifier[],
  bucket: string,
  rule: RateLimitRule,
): Promise<CounterReading[]> => {
  const keys = identifiers.map(({ scope, value }) => rateLimitKey(bucket, scope, value));
  const hits = await incrementWithTTL(keys, rule.WINDOW_SECONDS);

  return keys.map((_key, index) => ({
    scope: identifiers[index].scope,
    value: identifiers[index].value,
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
      scope: binding.scope,
      identifier: binding.value,
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
