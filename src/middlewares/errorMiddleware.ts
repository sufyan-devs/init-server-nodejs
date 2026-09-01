import type { Request, Response, NextFunction } from 'express';
import ApiError from '@utils/apiError';
import AuthErrors from '@constants/authErrors';
import { logger } from '@utils/logger';
import { envConfig } from '@config/env';
import { getClientIp } from '@utils/clientIp';

type AppError = Error & Record<string, any>;

const errorMiddleware = (err: AppError, req: Request, res: Response, _next: NextFunction): void => {
  const logMeta: Record<string, unknown> = {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: getClientIp(req),
    userAgent: req.get('User-Agent'),
  };

  if (err instanceof ApiError) {
    logger.warn('API Error', logMeta);
    const body: Record<string, unknown> = { success: false, message: err.message };
    if (err.code) body.code = err.code;
    res.status(err.statusCode).json(body);
    return;
  }

  if (err.name === 'ValidationError') {
    logger.warn('Validation Error', logMeta);
    const messages: string[] = Object.values(err.errors).map((e: any) => e.message);
    res.status(400).json({
      success: false,
      message: messages.join(', '),
    });
    return;
  }

  if (err.code === 11000) {
    logger.warn('Duplicate Key Error', logMeta);
    const field: string = Object.keys(err.keyValue)[0];
    res.status(409).json({
      success: false,
      message: `${field} already exists`,
    });
    return;
  }

  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    logger.warn('JWT Error', logMeta);
    res.status(401).json({
      success: false,
      code: AuthErrors.SESSION_EXPIRED.code,
      message: AuthErrors.SESSION_EXPIRED.message,
    });
    return;
  }

  logger.error('Unhandled Error', logMeta);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    ...(!envConfig.IN_PROD && { stack: err.stack }),
  });
};

export default errorMiddleware;
