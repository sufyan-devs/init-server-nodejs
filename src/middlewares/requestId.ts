import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { requestContext } from '@utils/logger';

interface RequestStore {
  requestId: string;
  method: string;
  url: string;
  [key: string]: unknown;
}

const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const requestId: string = (req.headers['x-request-id'] as string) || randomUUID();
  const store: RequestStore = { requestId, method: req.method, url: req.originalUrl };

  res.setHeader('X-Request-Id', requestId);
  req.requestId = requestId;

  requestContext.run(store as any, () => next());
};

export default requestIdMiddleware;
