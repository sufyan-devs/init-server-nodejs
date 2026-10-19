import type { Logger } from 'winston';
import { createLogger, format, transports } from 'winston';
import { AsyncLocalStorage } from 'node:async_hooks';
import { envConfig } from '@config/env';

interface RequestContextStore {
  requestId?: string;
  method?: string;
  url?: string;
}

const LOG_FILE_MAX_BYTES = 5 * 1024 * 1024;

const requestContext = new AsyncLocalStorage<RequestContextStore>();

const getRequestContext = (): RequestContextStore => requestContext.getStore() || {};

const requestContextFormat = format((info) => {
  const ctx = getRequestContext();
  if (ctx.requestId) info.requestId = ctx.requestId;
  if (ctx.method) info.method = ctx.method;
  if (ctx.url) info.url = ctx.url;
  return info;
});

const prodFormat = format.printf(({ timestamp, level, message, requestId, ...meta }) => {
  const log: Record<string, unknown> = {
    timestamp,
    level,
    message,
  };
  if (requestId) log.requestId = requestId;
  const { service: _service, ...rest } = meta;
  if (Object.keys(rest).length) Object.assign(log, rest);
  return JSON.stringify(log);
});

const devFormat = format.combine(
  format.colorize(),
  format.printf(({ timestamp, level, message, requestId, ...meta }) => {
    const rid = requestId ? `[${requestId}] ` : '';
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}: ${rid}${message}${metaStr}`;
  }),
);

const logger: Logger = createLogger({
  level: envConfig.IN_PROD ? 'info' : 'debug',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    requestContextFormat(),
    format.errors({ stack: true }),
    envConfig.IN_PROD ? prodFormat : devFormat,
  ),
  transports: [
    new transports.Console(),
    ...(envConfig.IN_PROD
      ? [
          new transports.File({ filename: 'logs/error.log', level: 'error', maxsize: LOG_FILE_MAX_BYTES, maxFiles: 5 }),
          new transports.File({ filename: 'logs/combined.log', maxsize: LOG_FILE_MAX_BYTES, maxFiles: 5 }),
        ]
      : []),
  ],
  exitOnError: false,
});

export { logger, requestContext };
export type { RequestContextStore };
