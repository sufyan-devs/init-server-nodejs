import { execSync } from 'node:child_process';
import mongoose from 'mongoose';
import { envConfig } from '@config/env';
import { connectDatabase, disconnectDatabase } from '@config/database';
import { logger } from '@utils/logger';
import { errorMessage } from '@utils/format';
import { redisClient, initRedis } from '@utils/redisClient';

const reset = async (): Promise<void> => {
  if (envConfig.IN_PROD) {
    logger.error('Refusing to run with NODE_ENV=production. This deletes everything.');
    process.exit(1);
  }

  await connectDatabase();
  const name = mongoose.connection.name;
  // The target is named on the command line and must match what the env resolved to:
  // a shell missing its env overrides silently points at the dev database instead.
  const confirmed = process.argv[2];
  if (confirmed !== name) {
    logger.error(`Refusing to reset: this would drop "${name}". Re-run as: npm run db:reset -- ${name}`);
    await disconnectDatabase();
    process.exit(1);
  }
  await mongoose.connection.dropDatabase();
  logger.warn(`dropped mongo database: ${name}`);
  await disconnectDatabase();

  // Sessions and lockout counters are keyed by user id: a stale Redis over a fresh
  // Mongo leaves sessions pointing at deleted users, which looks like an auth bug.
  await initRedis();
  await redisClient.flushDb();
  logger.warn(`flushed redis db ${envConfig.REDIS.DB}`);
  await redisClient.close();

  // execSync because npm is npm.cmd on Windows; the seed order lives in the npm script.
  execSync('npm run seed', { stdio: 'inherit' });

  logger.warn('Reset complete. Fresh database, empty Redis, roles and users seeded.');
};

reset().catch((error: unknown) => {
  logger.error('Reset failed', { error: errorMessage(error) });
  process.exit(1);
});
