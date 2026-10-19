import type { RedisClientType } from 'redis';
import { createClient } from 'redis';
import { envConfig } from '@config/env';
import { logger } from '@utils/logger';
import { errorMessage } from '@utils/format';

// node-redis parses `url` after the plain options, so a `database` option is
// silently overridden by the URL's db index — which is 0 when the URL omits it.
// Writing it into the URL keeps REDIS_DB authoritative and gives one source of truth.
const withDatabase = (url: string, db: number): string => {
  const parsed = new URL(url);
  const fromUrl = parsed.pathname.replace(/^\//, '');

  // Disagreement is a deployment mistake, and silently picking one means a service
  // reads an empty keyspace and looks like it lost every session.
  if (fromUrl !== '' && Number(fromUrl) !== db) {
    throw new Error(
      `[config] REDIS_URL selects database ${fromUrl} but REDIS_DB is ${db}. ` +
        `Set them to the same value, or drop the index from REDIS_URL.`,
    );
  }

  parsed.pathname = `/${db}`;
  return parsed.toString();
};

const redisUrl: string = withDatabase(
  envConfig.REDIS.URL || `redis://${envConfig.REDIS.HOST}:${envConfig.REDIS.PORT}`,
  envConfig.REDIS.DB,
);

const clientOptions: any = {
  url: redisUrl,
  socket: {
    reconnectStrategy: (retries: number): number | Error => {
      const max = envConfig.REDIS.MAX_RETRIES;
      if (retries > max) {
        logger.error(`Redis: Max reconnection attempts (${max}) exceeded`);
        return new Error("Redis reconnection limit exceeded");
      }
      const delay = Math.min(
        envConfig.REDIS.RETRY_DELAY * retries,
        10000,
      );
      logger.warn(
        `Redis: Reconnecting in ${delay}ms (attempt ${retries}/${max})`,
      );
      return delay;
    },
    connectTimeout: envConfig.REDIS.CONNECTION_TIMEOUT,
    keepAlive: 30000,
  },
};

if (envConfig.REDIS.PASSWORD) {
  clientOptions.password = envConfig.REDIS.PASSWORD;
} else if (envConfig.IN_PROD) {
  logger.warn("[SECURITY] Redis password not set!");
}

const isLocalhost: boolean =
  redisUrl.includes("127.0.0.1") || redisUrl.includes("localhost");
if (envConfig.IN_PROD && !isLocalhost) {
  if (clientOptions.socket) {
    clientOptions.socket.tls = true;
  }
  logger.info("[SECURITY] Redis TLS enabled for production");
}

const client: RedisClientType = createClient(clientOptions) as RedisClientType;
let isConnected: boolean = false;

client.on("error", (err: Error) => {
  logger.error("Redis connection error", { error: err.message });
  isConnected = false;
});

client.on("connect", () => {
  logger.info("Redis connected");
  isConnected = true;
});

client.on("ready", () => {
  logger.info("Redis ready");
});

async function initRedis(timeoutMs: number = 5000): Promise<void> {
  if (isConnected) return;
  try {
    logger.info(`Redis: Attempting connection to ${redisUrl}`);
    const connectPromise = client.connect();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Redis connection timeout")),
        timeoutMs,
      ),
    );
    await Promise.race([connectPromise, timeoutPromise]);
    isConnected = true;
    try {
      const info = await client.info();
      const v = info.match(/redis_version:([^\r\n]+)/)?.[1] || "unknown";
      logger.info(`Redis initialized (v${v}, DB: ${envConfig.REDIS.DB || 0})`);
    } catch {
      logger.info("Redis initialized");
    }
  } catch (err: unknown) {
    const message = errorMessage(err);
    logger.error(`Redis initialization failed at ${redisUrl}`, {
      error: message,
    });
    isConnected = false;
    throw err;
  }
}

function getIsConnected(): boolean {
  return isConnected;
}

export { client as redisClient, initRedis, getIsConnected };
