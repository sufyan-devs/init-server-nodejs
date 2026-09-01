import type { Request, Response, NextFunction } from 'express';
import { logger } from '@utils/logger';
import { getClientIp } from '@utils/clientIp';

const httpLoggerMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const start: number = Date.now();
  const clientIp: string = getClientIp(req);

  res.on('finish', () => {
    const duration: number = Date.now() - start;
    const level: 'warn' | 'info' = res.statusCode >= 400 ? 'warn' : 'info';

    logger[level](`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`, {
      statusCode: res.statusCode,
      duration,
      ip: clientIp,
      userAgent: req.get('User-Agent'),
    });
  });

  next();
};

export default httpLoggerMiddleware;
