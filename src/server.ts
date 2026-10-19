import 'dotenv/config';
import type { Server } from 'node:http';
import type { Request, Response } from 'express';
import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { envConfig } from '@config/env';
import { connectDatabase, disconnectDatabase } from '@config/database';
import { logger } from '@utils/logger';
import { initRedis, redisClient } from '@utils/redisClient';
import ApiError from '@utils/apiError';
import { errorMessage } from '@utils/format';
import requestIdMiddleware from '@middlewares/requestId';
import httpLoggerMiddleware from '@middlewares/httpLogger';
import indexRoutes from '@/routes/index';
import errorMiddleware from '@middlewares/errorMiddleware';

import '@user/models/User';
import '@user/models/Role';
import '@user/models/UserRole';
import { globalRateLimit, rateLimit } from '@middlewares/rateLimit';

const app = express();

if (envConfig.IN_PROD) {
  app.set('trust proxy', envConfig.TRUSTED_PROXY_COUNT);
}

app.use(requestIdMiddleware);

// A JSON API serves no scripts, styles or images, so it needs none of those
// directives — and `unsafe-inline`/`unsafe-eval` would give away most of what a
// CSP is for. helmet also owns nosniff, frameguard and Referrer-Policy; setting
// them again by hand would override its choices, including its deliberate
// `X-XSS-Protection: 0` (the legacy auditor is itself an XSS vector).
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    frameguard: { action: 'deny' },
  }),
);

const allowedOrigins = envConfig.ALLOWED_ORIGINS;

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (!envConfig.IN_PROD && origin.match(/^https?:\/\/localhost(:\d+)?$/)) {
        return callback(null, true);
      }
      callback(ApiError.forbidden('Origin not allowed', 'CORS_ORIGIN_DENIED'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', envConfig.CSRF.HEADER_NAME, 'X-Timezone'],
  }),
);

app.use(compression());

// Health answers before the limiter: a load balancer's checks come from very few
// IPs and would burn the allowance during an incident.
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: envConfig.APP_NAME,
    env: envConfig.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// Its own counter, not the API one: a page rendering 20 uploaded images would
// otherwise spend 20 of that visitor's API allowance before they call anything.
// Serve these from nginx or a CDN in production and this mount goes away.
app.use(
  '/uploads',
  rateLimit({ bucket: 'static', rule: envConfig.RATE_LIMIT.GLOBAL, by: 'ip' }),
  express.static(path.join(process.cwd(), 'uploads')),
);

// Before the body parser: JSON.parse of a large body is synchronous, un-yieldable
// event-loop time, and a limiter mounted after it never gets to prevent that cost.
app.use(globalRateLimit);

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(envConfig.SESSION.COOKIE.SECRET));
app.use(httpLoggerMiddleware);

app.use('/api/v1', indexRoutes);

app.use(errorMiddleware);

let httpServer: Server | undefined;

const startServer = async (): Promise<void> => {
  try {
    if (envConfig.IN_PROD && allowedOrigins.length === 0) {
      logger.error('ALLOWED_ORIGINS is required in production');
      process.exit(1);
    }

    // Fail fast: sessions live in Redis, so without it every login fails.
    // initRedis has already logged the cause.
    try {
      await initRedis();
    } catch {
      process.exit(1);
    }

    await connectDatabase();

    // Express 5 hands listen errors (e.g. EADDRINUSE) to this callback instead of throwing.
    httpServer = app.listen(envConfig.PORT, (error?: Error) => {
      if (error) {
        logger.error('HTTP server failed to start', { error: error.message });
        process.exit(1);
      }
      if (!envConfig.IN_PROD) {
        logger.info(`${envConfig.APP_NAME} running on port ${envConfig.PORT} [${envConfig.NODE_ENV}]`);
        logger.info(`Health: http://localhost:${envConfig.PORT}/health`);
        logger.info(`API:    http://localhost:${envConfig.PORT}/api/v1`);
        logger.info(`CORS:   ${allowedOrigins.join(', ') || 'localhost (dev)'}`);
      } else {
        logger.info(`${envConfig.APP_NAME} started [${envConfig.NODE_ENV}]`);
      }
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
};

const shutdown = async (signal: string): Promise<void> => {
  logger.info(`${signal} received — shutting down...`);
  try {
    const server = httpServer;
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
    await disconnectDatabase();
    if (redisClient.isOpen) await redisClient.close();
    process.exit(0);
  } catch (error: unknown) {
    logger.error('Shutdown failed', { error: errorMessage(error) });
    process.exit(1);
  }
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

void startServer();
