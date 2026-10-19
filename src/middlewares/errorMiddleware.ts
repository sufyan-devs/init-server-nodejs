import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import ApiError from '@utils/apiError';
import response from '@utils/response';
import { logger } from '@utils/logger';
import { envConfig } from '@config/env';
import { DUPLICATE_KEY_ERROR_CODE } from '@utils/mongoHelper';

const VALIDATION_CODE = 'VALIDATION_ERROR';
const DUPLICATE_KEY_CODE = 'DUPLICATE_KEY';
const BAD_REQUEST_CODE = 'BAD_REQUEST';
const INTERNAL_ERROR_CODE = 'INTERNAL_ERROR';

const BODY_ERROR_CODES: Record<string, string> = {
  'entity.parse.failed': 'MALFORMED_JSON',
  'entity.too.large': 'PAYLOAD_TOO_LARGE',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

// body-parser (via http-errors) marks errors caused by the request itself with a 4xx status.
const clientErrorStatus = (err: Record<string, unknown>): number | undefined => {
  const status = err.status ?? err.statusCode;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
};

const errorMiddleware = (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
  const error = err instanceof Error ? err : new Error(String(err));
  const logMeta: Record<string, unknown> = {
    message: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip ?? '',
    userAgent: req.get('User-Agent'),
  };

  if (err instanceof ApiError) {
    logger.warn('API Error', logMeta);
    response.error(res, err.code ? { code: err.code, message: err.message } : err.message, err.statusCode);
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    logger.warn('Validation Error', logMeta);
    const message = Object.values(err.errors).map((e) => e.message).join(', ');
    response.error(res, { code: VALIDATION_CODE, message }, 400);
    return;
  }

  if (err instanceof multer.MulterError) {
    logger.warn('Upload Error', logMeta);
    response.error(res, { code: err.code, message: err.message }, 400);
    return;
  }

  const fields: Record<string, unknown> = isRecord(err) ? err : {};

  if (fields.code === DUPLICATE_KEY_ERROR_CODE) {
    logger.warn('Duplicate Key Error', logMeta);
    const field = isRecord(fields.keyValue) ? Object.keys(fields.keyValue)[0] : undefined;
    response.error(res, { code: DUPLICATE_KEY_CODE, message: `${field ?? 'Value'} already exists` }, 409);
    return;
  }

  const status = clientErrorStatus(fields);
  if (status !== undefined) {
    logger.warn('Request Error', logMeta);
    const code = (typeof fields.type === 'string' && BODY_ERROR_CODES[fields.type]) || BAD_REQUEST_CODE;
    const message = fields.expose === true ? error.message : 'Bad request';
    response.error(res, { code, message }, status);
    return;
  }

  logger.error('Unhandled Error', logMeta);
  response.error(
    res,
    { code: INTERNAL_ERROR_CODE, message: 'Internal server error' },
    500,
    envConfig.IN_PROD ? {} : { stack: error.stack },
  );
};

export default errorMiddleware;
