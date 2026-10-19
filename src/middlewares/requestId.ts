import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { requestContext, type RequestContextStore } from '@utils/logger';

// The id is echoed into a response header and every log line, so a client-chosen value is bounded.
const CLIENT_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const supplied = req.get('x-request-id');
  const requestId: string = supplied && CLIENT_REQUEST_ID.test(supplied) ? supplied : randomUUID();
  const store: RequestContextStore = { requestId, method: req.method, url: req.originalUrl };

  res.setHeader('X-Request-Id', requestId);
  req.requestId = requestId;

  requestContext.run(store, () => next());
};

export default requestIdMiddleware;
